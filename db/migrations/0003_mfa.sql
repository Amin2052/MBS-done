-- MBS 0003 — second factor: TOTP credentials, recovery codes and login challenges.
--
-- Everything here lives in `platform`, because a second factor is about a person, not a
-- business: the same owner may hold memberships in two businesses, and the factor must be
-- the same in both. `app_runtime` gets no table privilege at all; every read and write
-- goes through the SECURITY DEFINER functions below, each of which takes the user id (or a
-- challenge-token hash) the server has already established.
--
-- Three deliberate properties:
--   * the TOTP secret is stored sealed (AES-256-GCM, key outside the database), never as
--     base32 text;
--   * a recovery code is stored as sha256 of its dense form and can be spent exactly once;
--   * a login challenge is stored as a sha256 of its opaque token, expires quickly, and is
--     invalidated by consumption, by too many wrong codes, or by a newer challenge for the
--     same user.
--
-- No new tenant table is created, so the generated tenancy loop from 0001 is unchanged.

-- ---------------------------------------------------------- credentials --------

create table platform.mfa_credentials (
  user_id           uuid primary key references platform.users (id) on delete cascade,
  secret_ciphertext text not null,
  algorithm         text not null default 'SHA1' check (algorithm = 'SHA1'),
  digits            smallint not null default 6 check (digits between 6 and 10),
  period_seconds    smallint not null default 30 check (period_seconds between 15 and 120),
  confirmed_at      timestamptz,
  -- The step of the last accepted code: a code from this step or earlier is a replay.
  last_used_step    bigint,
  created_at        timestamptz not null default now()
);

create table platform.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references platform.users (id) on delete cascade,
  code_hash  bytea not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint mfa_recovery_codes_unique unique (user_id, code_hash)
);

create index mfa_recovery_codes_user_idx on platform.mfa_recovery_codes (user_id);

create table platform.mfa_challenges (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  user_id     uuid not null references platform.users (id) on delete cascade,
  -- Deliberately not called `tenant_id`: this is the business the password step chose and
  -- the challenge is bound to, not a tenant-scoped row. The tenancy checker treats any
  -- `tenant_id` column as a tenant table that must carry RLS, and this one must not be
  -- reachable through tenant context at all.
  bound_tenant_id uuid not null references platform.tenants (id) on delete cascade,
  purpose     text not null check (purpose in ('verify', 'enroll')),
  -- sha256 of the address, so a burst of wrong codes can be throttled without storing an
  -- address in the clear.
  email_hash  text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  attempts    smallint not null default 0 check (attempts >= 0),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index mfa_challenges_user_idx on platform.mfa_challenges (user_id);
create index mfa_challenges_expiry_idx on platform.mfa_challenges (expires_at);

revoke all on table
  platform.mfa_credentials,
  platform.mfa_recovery_codes,
  platform.mfa_challenges
from public;

-- ---------------------------------------------------------------- state --------

-- What the login flow needs to know before it asks for a code: is there a confirmed
-- credential, and if so which sealed secret and step must a code be checked against.
create function platform.mfa_state(p_user_id uuid)
returns table (
  secret_ciphertext text,
  confirmed_at      timestamptz,
  last_used_step    bigint
)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select c.secret_ciphertext, c.confirmed_at, c.last_used_step
  from platform.mfa_credentials c
  where c.user_id = p_user_id
  limit 1;
$$;

-- ------------------------------------------------------------ challenges ------

-- One live challenge per user: opening a second tab must not leave two usable tickets, and
-- a new sign-in attempt invalidates the previous one. The expiry is passed in rather than
-- computed here, so the whole flow shares one clock (the server's) and a test can move it.
create function platform.mfa_begin(
  p_user_id    uuid,
  p_token_hash bytea,
  p_tenant_id  uuid,
  p_purpose    text,
  p_email_hash text,
  p_expires_at timestamptz
)
returns table (expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = platform, pg_temp
as $$
begin
  delete from platform.mfa_challenges c
   where c.user_id = p_user_id
     and (c.consumed_at is not null or c.expires_at <= p_expires_at);

  delete from platform.mfa_challenges c
   where c.user_id = p_user_id and c.consumed_at is null and c.expires_at > p_expires_at;

  return query
    insert into platform.mfa_challenges
      (token_hash, user_id, bound_tenant_id, purpose, email_hash, expires_at)
    values
      (p_token_hash, p_user_id, p_tenant_id, p_purpose, p_email_hash, p_expires_at)
    returning mfa_challenges.expires_at;
end
$$;

create function platform.mfa_challenge_lookup(p_token_hash bytea)
returns table (
  user_id         uuid,
  bound_tenant_id uuid,
  purpose         text,
  email_hash      text,
  attempts        smallint,
  expires_at      timestamptz,
  consumed_at     timestamptz
)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select c.user_id, c.bound_tenant_id, c.purpose, c.email_hash, c.attempts, c.expires_at, c.consumed_at
  from platform.mfa_challenges c
  where c.token_hash = p_token_hash
  limit 1;
$$;

-- Count a wrong code. Reaching the maximum consumes the challenge, so the next attempt
-- needs the password again (and the account throttle below has been counting too).
create function platform.mfa_challenge_fail(p_token_hash bytea, p_max_attempts integer)
returns table (attempts integer, exhausted boolean)
language plpgsql
volatile
security definer
set search_path = platform, pg_temp
as $$
declare
  v_attempts integer;
begin
  update platform.mfa_challenges c
     set attempts = c.attempts + 1,
         consumed_at = case when c.attempts + 1 >= p_max_attempts then now() else c.consumed_at end
   where c.token_hash = p_token_hash
     and c.consumed_at is null
  returning c.attempts into v_attempts;

  return query select coalesce(v_attempts, -1), coalesce(v_attempts >= p_max_attempts, false);
end
$$;

-- Single use: the update only matches a live challenge, so a replayed response fails even
-- if two requests race (one of them updates, the other matches nothing).
create function platform.mfa_challenge_consume(p_token_hash bytea)
returns boolean
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  with consumed as (
    update platform.mfa_challenges c
       set consumed_at = now()
     where c.token_hash = p_token_hash
       and c.consumed_at is null
    returning 1
  )
  select exists (select 1 from consumed);
$$;

-- ------------------------------------------------------------- enrolment ------

create function platform.mfa_enroll_store(p_user_id uuid, p_ciphertext text)
returns void
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  insert into platform.mfa_credentials (user_id, secret_ciphertext)
  values (p_user_id, p_ciphertext)
  on conflict (user_id) do update
    set secret_ciphertext = excluded.secret_ciphertext,
        confirmed_at = null,
        last_used_step = null,
        created_at = now();
$$;

-- Confirm the first code: the credential becomes active and the recovery codes that were
-- just generated replace any earlier set (a repeated enrolment must not leave old codes
-- alive).
create function platform.mfa_enroll_confirm(p_user_id uuid, p_step text, p_codes text[])
returns void
language plpgsql
volatile
security definer
set search_path = platform, pg_temp
as $$
begin
  update platform.mfa_credentials c
     set confirmed_at = now(), last_used_step = p_step::bigint
   where c.user_id = p_user_id;

  update platform.users u
     set mfa_enrolled_at = coalesce(u.mfa_enrolled_at, now()), updated_at = now()
   where u.id = p_user_id;

  delete from platform.mfa_recovery_codes rc where rc.user_id = p_user_id;

  -- Hex text in, bytea out: an array of bytea does not survive every driver's parameter
  -- encoding, and a checksum byte string is not a place to discover that at runtime.
  insert into platform.mfa_recovery_codes (user_id, code_hash)
  select p_user_id, decode(code_hex, 'hex')
  from unnest(p_codes) as code_hex;
end
$$;

-- Spend a recovery code. `used_at is null` in the WHERE clause is what makes it single use.
create function platform.mfa_recovery_use(p_user_id uuid, p_code_hash bytea)
returns boolean
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  with used as (
    update platform.mfa_recovery_codes rc
       set used_at = now()
     where rc.user_id = p_user_id
       and rc.code_hash = p_code_hash
       and rc.used_at is null
    returning 1
  )
  select exists (select 1 from used);
$$;

create function platform.mfa_recovery_remaining(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select count(*)::int
  from platform.mfa_recovery_codes rc
  where rc.user_id = p_user_id and rc.used_at is null;
$$;

create function platform.mfa_touch_step(p_user_id uuid, p_step text)
returns void
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  update platform.mfa_credentials c
     set last_used_step = p_step::bigint
   where c.user_id = p_user_id
     and (c.last_used_step is null or c.last_used_step < p_step::bigint);
$$;

-- ---------------------------------------------------------------- grants ------

revoke all on function
  platform.mfa_state(uuid),
  platform.mfa_begin(uuid, bytea, uuid, text, text, timestamptz),
  platform.mfa_challenge_lookup(bytea),
  platform.mfa_challenge_fail(bytea, integer),
  platform.mfa_challenge_consume(bytea),
  platform.mfa_enroll_store(uuid, text),
  platform.mfa_enroll_confirm(uuid, text, text[]),
  platform.mfa_recovery_use(uuid, bytea),
  platform.mfa_recovery_remaining(uuid),
  platform.mfa_touch_step(uuid, text)
from public;

grant execute on function
  platform.mfa_state(uuid),
  platform.mfa_begin(uuid, bytea, uuid, text, text, timestamptz),
  platform.mfa_challenge_lookup(bytea),
  platform.mfa_challenge_fail(bytea, integer),
  platform.mfa_challenge_consume(bytea),
  platform.mfa_enroll_store(uuid, text),
  platform.mfa_enroll_confirm(uuid, text, text[]),
  platform.mfa_recovery_use(uuid, bytea),
  platform.mfa_recovery_remaining(uuid),
  platform.mfa_touch_step(uuid, text)
to app_runtime;
