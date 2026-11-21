-- MBS 0001 — foundation: schemas, roles, tenancy primitives, audit log.
--
-- Applied by mbs_migrator. The application connects as app_runtime, which:
--   * does not own any table,
--   * has no BYPASSRLS attribute,
--   * has no direct privileges on platform.* (identity is reached only through the
--     SECURITY DEFINER function below),
--   * reaches tenant.* only through RLS policies that depend on app.tenant_id.
--
-- Every amount is numeric(19,4) (ADR-0003). No real/double precision anywhere.
-- Tenant context is transaction-local: select set_config('app.tenant_id', $1, true).

begin;

create schema if not exists platform;
create schema if not exists tenant;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mbs_migrator') then
    create role mbs_migrator nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin noinherit;
  end if;
end
$$;

revoke all on schema platform, tenant from public;

-- ---------------------------------------------------------------- platform -----

create table platform.tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  name              text not null check (length(btrim(name)) between 1 and 120),
  status            text not null default 'active'
                    check (status in ('active', 'suspended', 'cancelled')),
  numbering_system  text not null default 'bengali'
                    check (numbering_system in ('bengali', 'latin')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$')
);

create unique index tenants_slug_uidx on platform.tenants (slug);

create table platform.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (position('@' in email) > 1),
  password_hash      text not null,
  email_verified_at  timestamptz,
  mfa_enrolled_at    timestamptz,
  status             text not null default 'active'
                     check (status in ('active', 'locked', 'disabled')),
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  locked_until       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index users_email_lower_uidx on platform.users (lower(email));

-- Identity is global (a person may work for two businesses). Login therefore needs a
-- lookup that is not tenant-scoped, but the runtime role must not be able to browse the
-- identity table, so the only door is this function.
create function platform.user_by_email(p_email text)
returns table (
  id                 uuid,
  password_hash      text,
  status             text,
  locked_until       timestamptz,
  failed_login_count integer
)
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select u.id, u.password_hash, u.status, u.locked_until, u.failed_login_count
  from platform.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function platform.user_by_email(text) from public;
grant usage on schema platform to app_runtime;
grant execute on function platform.user_by_email(text) to app_runtime;
revoke all on table platform.tenants, platform.users from app_runtime;

-- ------------------------------------------------------------------ tenant -----

create table tenant.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants (id) on delete cascade,
  user_id     uuid not null references platform.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'accountant', 'employee')),
  status      text not null default 'invited'
              check (status in ('invited', 'active', 'suspended', 'removed')),
  permissions jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint memberships_unique_member unique (tenant_id, user_id)
);

create index memberships_user_idx on tenant.memberships (user_id);

create table tenant.sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants (id) on delete cascade,
  user_id       uuid not null references platform.users (id) on delete cascade,
  token_hash    bytea not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  ip_hash       bytea,
  user_agent_hash bytea,
  constraint sessions_token_unique unique (token_hash),
  constraint sessions_expiry_sane check (expires_at > created_at)
);

create index sessions_user_idx on tenant.sessions (user_id);

create table tenant.org_settings (
  tenant_id          uuid primary key references platform.tenants (id) on delete cascade,
  legal_name         text,
  bin                text,
  address            text,
  phone              text,
  email              text,
  currency           text not null default 'BDT' check (currency = 'BDT'),
  timezone           text not null default 'Asia/Dhaka' check (timezone = 'Asia/Dhaka'),
  numbering_system   text not null default 'bengali'
                     check (numbering_system in ('bengali', 'latin')),
  fiscal_year_start_month integer not null default 7
                     check (fiscal_year_start_month between 1 and 12),
  vat_registered     boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- @append-only — no update or delete policy; corrections are new rows.
create table tenant.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references platform.tenants (id) on delete cascade,
  actor_user_id uuid,
  action      text not null check (length(action) between 3 and 80),
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  request_id  text,
  ip_hash     bytea,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_created_idx on tenant.audit_log (tenant_id, created_at desc);

-- Gapless per-tenant, per-series counters. Locked with SELECT ... FOR UPDATE inside the
-- writing transaction; never advisory locks (ADR-0001, ADR-0002).
create table tenant.counters (
  tenant_id  uuid not null references platform.tenants (id) on delete cascade,
  scope      text not null check (length(scope) between 1 and 60),
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope)
);

-- ------------------------------------------------------------ RLS policies -----
-- Applies the four mandatory policies to every tenant table, and only SELECT+INSERT to
-- append-only tables. A new tenant table added in a later migration must be listed here
-- (tools/check-rls.mjs fails the build if it is not).

do $$
declare
  t          text;
  append_only boolean;
  cmd        text;
  cmds       text[];
begin
  foreach t in array array[
    'tenant.memberships',
    'tenant.sessions',
    'tenant.org_settings',
    'tenant.counters',
    'tenant.audit_log'
  ]
  loop
    append_only := t = 'tenant.audit_log';

    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);

    cmds := case when append_only
                 then array['select', 'insert']
                 else array['select', 'insert', 'update', 'delete']
            end;

    foreach cmd in array cmds
    loop
      if cmd = 'insert' then
        execute format(
          'create policy %I on %s for insert with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
          replace(t, '.', '_') || '_insert', t);
      else
        execute format(
          'create policy %I on %s for %s using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
          replace(t, '.', '_') || '_' || cmd, t, cmd);
      end if;
    end loop;
  end loop;
end
$$;

grant usage on schema tenant to app_runtime;
grant select, insert, update, delete on
  tenant.memberships, tenant.sessions, tenant.org_settings, tenant.counters
  to app_runtime;
grant select, insert on tenant.audit_log to app_runtime;
grant usage, select on all sequences in schema tenant to app_runtime;

commit;
