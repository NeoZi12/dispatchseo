-- 0024: waitlist per-IP rate limit (pre-launch security pass).
-- The landing waitlist form is the only unauthenticated write in the app; the
-- honeypot stops dumb bots but nothing stopped a scripted flood from filling
-- waitlist_signups and firing one Resend email per fresh address. Same shape
-- as 0021's login lockout: an atomic Postgres counter, 5 attempts per IP per
-- hour, code fails OPEN if this migration has not run yet.
create table if not exists waitlist_attempts (
  ip text primary key,
  attempts int not null default 1,
  window_start timestamptz not null default now()
);

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table waitlist_attempts enable row level security;

-- Returns true if this attempt is within the limit, false if the IP is over it.
create or replace function record_waitlist_attempt(attempt_ip text)
returns boolean
language plpgsql
as $$
declare
  current_attempts int;
begin
  delete from waitlist_attempts
    where ip = attempt_ip and window_start < now() - interval '1 hour';

  insert into waitlist_attempts (ip) values (attempt_ip)
  on conflict (ip) do update set attempts = waitlist_attempts.attempts + 1;

  select attempts into current_attempts from waitlist_attempts where ip = attempt_ip;
  return current_attempts <= 5;
end;
$$;
