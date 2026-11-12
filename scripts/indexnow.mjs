#!/usr/bin/env node
// Tells Bing (and the other IndexNow engines: Yandex, Naver, Seznam) that pages
// on dispatchseo.com are new or changed, so they are crawled in minutes rather
// than whenever the next sitemap read happens. ChatGPT search leans on Bing's
// index, which is why this matters more than its share of human searches.
// Google does not take part in IndexNow: for Google, use "Request indexing" in
// Search Console.
//
//   node scripts/indexnow.mjs /pricing /blog/some-post   # these pages
//   node scripts/indexnow.mjs                            # every sitemap URL
//
// The key is the name of the one hex-named .txt file in public/ (served at
// https://dispatchseo.com/<key>.txt and allowlisted in src/proxy.ts). No
// secrets: an IndexNow key is public by design, the engine checks it against
// that file.

import { readdirSync } from "node:fs";

const HOST = "dispatchseo.com";
const ORIGIN = `https://${HOST}`;

const keyFile = readdirSync(new URL("../public/", import.meta.url)).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("No IndexNow key file (public/<32 hex>.txt) found.");
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, "");

let urls = process.argv.slice(2).map((a) => (a.startsWith("http") ? a : ORIGIN + (a.startsWith("/") ? a : `/${a}`)));
if (urls.length === 0) {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
const foreign = urls.filter((u) => new URL(u).host !== HOST);
if (foreign.length) {
  console.error(`Not on ${HOST}: ${foreign.join(", ")}`);
  process.exit(1);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `${ORIGIN}/${keyFile}`, urlList: urls }),
});
// 200 = accepted, 202 = accepted, key check pending. Anything else is a refusal.
console.log(`IndexNow answered ${res.status} for ${urls.length} URL(s).`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
for (const u of urls) console.log(`  ${u}`);
