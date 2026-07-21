-- 0029: GSC service-account JSON stored in the DB, encrypted (enc:v1:...),
-- so self-hosters connect Search Console entirely from the onboarding wizard
-- - paste the key file, verified on the spot - instead of editing .env and
-- restarting. The env var GSC_SERVICE_ACCOUNT_JSON still wins when set
-- (classic installs, Vercel deployments); the DB copy is the fallback.
-- Single-row instance_settings, same posture as 0026/0027.

alter table instance_settings add column if not exists gsc_service_account_json text;
