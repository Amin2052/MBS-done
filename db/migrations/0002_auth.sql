-- MBS 0002 — authentication: login throttle, capability policies, lookup functions.
--
-- Two questions are asked before any tenant context exists:
--   1. "which user is this?"      — needs platform.users, which app_runtime cannot read;
--   2. "which sessions/memberships belong to this unguessable token / user id?" — needs
--      rows in tenant.* before app.tenant_id is known.
--
-- (1) is answered by SECURITY DEFINER functions. (2) is answered by two *capability*
-- policies: the server sets a transaction-local value to a 256-bit token hash or a user
-- uuid it has just verified, and the policy exposes at most the rows that match it.
-- Neither setting is ever supplied by a browser (ADR-0015).
--
-- No new tenant table is created here, so the generated policy loop from 0001 is
-- untouched; the two capability policies are additive SELECT policies.

-- ------------------------------------------------------------ login throttle -----

-- Keyed by sha256(lower(email)) so the table holds no addresses at all.
create table platform.login_attempts (
  email_hash      text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  failures        integer not null default 0 check (failures >= 0),
  locked_until    timestamptz,
  last_failure_at timestamptz not null default now()
);

create index login_attempts_locked_idx
  on platform.login_attempts (locked_until)
  where locked_until is not null;

revoke all on table platform.login_attempts from public;

-- ------------------------------------------------------------- lookup doors -----

-- One row per email: the password verifier, plus the throttle state for that email.
create function platform.login_lookup(p_email text, p_email_hash text)
returns table (
  id                 uuid,
  password_hash      text,
  status             text,
  mfa_enrolled_at    timestamptz,
  locked_until       timestamptz,
  failures           integer
)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select u.id,
         u.password_hash,
         u.status,
         u.mfa_enrolled_at,
         a.locked_until,
         coalesce(a.failures, 0)
  from platform.users u
  left join platform.login_attempts a on a.email_hash = p_email_hash
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

-- Count a failure and lock the address once the threshold is reached. A lock that has
-- already expired restarts the count instead of re-locking on the next single failure.
create function platform.login_record_failure(
  p_email_hash   text,
  p_threshold    integer default 5,
  p_lock_seconds integer default 900
)
returns table (failures integer, locked_until timestamptz)
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  insert into platform.login_attempts as a (email_hash, failures, last_failure_at, locked_until)
  values (p_email_hash, 1, now(), null)
  on conflict (email_hash) do update
    set failures = case
                     when a.locked_until is not null and a.locked_until <= now() then 1
                     else a.failures + 1
                   end,
        last_failure_at = now(),
        locked_until = case
                         when (case when a.locked_until is not null and a.locked_until <= now()
                                    then 1 else a.failures + 1 end) >= p_threshold
                         then now() + make_interval(secs => p_lock_seconds)
                         else null
                       end
  returning a.failures, a.locked_until;
$$;

-- A successful login clears the throttle, so a legitimate user who mistyped twice is not
-- one accident away from a lock.
create function platform.login_record_success(p_email_hash text)
returns void
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  delete from platform.login_attempts a where a.email_hash = p_email_hash;
$$;

-- The signed-in user's own profile. Sessions carry ids only; the email is not duplicated
-- into a cookie, so /me asks for it here.
create function platform.user_profile(p_id uuid)
returns table (id uuid, email text, status text, mfa_enrolled_at timestamptz)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select u.id, u.email, u.status, u.mfa_enrolled_at
  from platform.users u
  where u.id = p_id;
$$;

revoke all on function platform.user_profile(uuid) from public;
grant execute on function platform.user_profile(uuid) to app_runtime;

-- Slug and display name for a tenant id the caller already holds (used by the business
-- picker and by /me). Platform tenants are never browsable: the id must be known first.
create function platform.tenant_by_id(p_id uuid)
returns table (id uuid, slug text, name text, status text)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select t.id, t.slug, t.name, t.status
  from platform.tenants t
  where t.id = p_id;
$$;

revoke all on function platform.login_lookup(text, text) from public;
revoke all on function platform.login_record_failure(text, integer, integer) from public;
revoke all on function platform.login_record_success(text) from public;
revoke all on function platform.tenant_by_id(uuid) from public;


grant execute on function platform.login_lookup(text, text) to app_runtime;
grant execute on function platform.login_record_failure(text, integer, integer) to app_runtime;
grant execute on function platform.login_record_success(text) to app_runtime;
grant execute on function platform.tenant_by_id(uuid) to app_runtime;

-- -------------------------------------------------- capability policies --------
-- @capability — SELECT-only, additive to the four mandatory policies. Each one is keyed
-- on a value the server derives after checking credentials, and neither can widen the
-- tenant boundary: a matching row is returned on its own, never a tenant's other rows.

create policy tenant_sessions_token_lookup on tenant.sessions
  for select
  using (token_hash = nullif(current_setting('app.session_token_hash', true), '')::bytea);

create policy tenant_memberships_user_lookup on tenant.memberships
  for select
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
