-- 0072: the drawn cover of each hosted-writer article (2026-11-05).
--
-- The writer now draws every article's cover as vector art about its actual
-- subject (src/lib/cover-art.ts): one illustrator call returns a transparent
-- SVG subject layer, stored here, and /api/cover/<draft> composites it onto
-- the house base and rasterizes it to the PNG that publishing commits and the
-- dashboard shows. Null = no drawing (older drafts, a failed or refused
-- call): the route draws the title card instead. The hue the layer was drawn
-- for is stamped on its root element (data-dsc-hue), so it needs no column.
--
-- Additive and nullable: code that predates it never reads it, and the
-- writer saves it in a separate update so a database without this column
-- still gets the article. Vanilla-Postgres safe, idempotent on replay.

alter table article_drafts add column if not exists cover_svg text;
