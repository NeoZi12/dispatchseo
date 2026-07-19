-- 0021: login brute-force lockout (launch plan step 1, security).
-- One row per source IP. 5 failed password attempts inside 15 minutes lock
-- that IP out for 15 minutes. All mutation goes through the
-- record_login_failure() function so the count stays atomic without Redis -
-- the dashboard is single-user, this only has to beat scripted guessing.
-- Successful login deletes the row. Complements (not replaces) the Vercel
-- WAF rate-limit rule on the login POST.
create table if not exists login_attempts (
  ip text primary key,
  fails int not null default 1,
  first_fail_at timestamptz not null default now(),
  locked_until timestamptz
);

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table login_attempts enable row level security;

create or replace function record_login_failure(attempt_ip text)
returns timestamptz
language plpgsql
as $$
declare
  result timestamptz;
begin
  -- Expired lock or expired 15-minute window: start the count over.
  delete from login_attempts
    where ip = attempt_ip
      and ((locked_until is not null and locked_until < now())
        or (locked_until is null and first_fail_at < now() - interval '15 minutes'));

  insert into login_attempts (ip, fails, first_fail_at)
  values (attempt_ip, 1, now())
  on conflict (ip) do update set fails = login_attempts.fails + 1;

  update login_attempts
    set locked_until = now() + interval '15 minutes'
    where ip = attempt_ip and fails >= 5 and locked_until is null;

  select locked_until into result from login_attempts where ip = attempt_ip;
  return result;
end;
$$;
