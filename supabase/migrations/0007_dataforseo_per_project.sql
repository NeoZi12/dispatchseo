-- 0007: per-project DataForSEO credentials - the free-tier DIY model. Each
-- project brings its own DataForSEO account, so rank checks, keyword research,
-- and Domain Rating bill the project owner, never the platform. The default
-- (ClockedCode) project keeps using the env credentials; every other project
-- gets NO env fallback - without its own credentials the SERP and DR features
-- skip gracefully and the "Connect DataForSEO" setup card shows on Home.
--
-- Same storage posture as mcp_token: the table is reachable only through the
-- service-role key (RLS on, zero policies), never from a browser.

alter table projects add column if not exists dataforseo_login text;
alter table projects add column if not exists dataforseo_password text;
