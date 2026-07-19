-- 0023: per-project Google OAuth refresh token (launch plan step 3).
-- The dashboard's "Connect Google Search Console" button stores the OAuth
-- refresh token here (AES-256-GCM via crypto.ts, same posture as
-- serpapi_key / dataforseo_password). This is the seed of the cloud GSC
-- flow; the service-account path keeps working unchanged - OAuth is an
-- alternative connection, not a replacement. Additive and nullable.
alter table projects add column if not exists gsc_oauth_refresh_token text;
