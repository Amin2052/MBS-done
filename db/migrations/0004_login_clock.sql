-- MBS 0004 — the login throttle takes the caller's clock.
--
-- 0002 computed `locked_until` from the database's `now()` and compared against it here,
-- while the API compared against its own clock. Two clocks in one rule is a bug waiting for
-- a clock skew: a test that moves time, or a pooled connection whose statement time differs
-- from the application's, would disagree about whether an address is locked.
--
-- The API now passes the instant it uses everywhere else. The rest of the rule is unchanged:
-- keyed by sha256(address), restarts after an expired lock, and `login_record_success`
-- clears it.

drop function platform.login_record_failure(text, integer, integer);

create function platform.login_record_failure(
  p_email_hash   text,
  p_threshold    integer,
  p_lock_seconds integer,
  p_now          timestamptz
)
returns table (failures integer, locked_until timestamptz)
language sql
volatile
security definer
set search_path = platform, pg_temp
as $$
  insert into platform.login_attempts as a (email_hash, failures, last_failure_at, locked_until)
  values (p_email_hash, 1, p_now, null)
  on conflict (email_hash) do update
    set failures = case
                     when a.locked_until is not null and a.locked_until <= p_now then 1
                     else a.failures + 1
                   end,
        last_failure_at = p_now,
        locked_until = case
                         when (case when a.locked_until is not null and a.locked_until <= p_now
                                    then 1 else a.failures + 1 end) >= p_threshold
                         then p_now + make_interval(secs => p_lock_seconds)
                         else null
                       end
  returning a.failures, a.locked_until;
$$;

revoke all on function platform.login_record_failure(text, integer, integer, timestamptz) from public;
grant execute on function platform.login_record_failure(text, integer, integer, timestamptz) to app_runtime;
