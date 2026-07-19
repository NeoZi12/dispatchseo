-- "Request Google indexing" follow-up state for published pages.
--
-- Google has no API for pushing regular pages into its index (IndexNow is
-- Bing/Yandex only; Google's Indexing API is restricted to job postings and
-- livestreams; the URL Inspection API is read-only). The fastest legitimate
-- path is a human clicking "Request indexing" in Search Console, so the
-- dashboard surfaces a next-action card for every freshly published page.
-- Marking the card done stamps this column and hides it.
alter table pages add column if not exists index_requested_at timestamptz;

comment on column pages.index_requested_at is
  'When the user marked the manual GSC "Request indexing" step done for this page. Null = still waiting (card shows on Home while the page is fresh).';
