// Reproduces the real-run info-gain asset in
// src/content/blog/best-keyword-clustering-tool.mdx: ten real keywords,
// deliberately mixing keyword-clustering and rank-tracking searches, run
// through this project's own clustering function with no mocking. Run with
// `node --experimental-strip-types scripts/cluster-test.mjs`.

import { clusterKeywords } from "../src/lib/keyword-clustering.ts";

const input = [
  "best keyword clustering tool",
  "keyword clustering tool free",
  "free keyword cluster tool",
  "how to cluster keywords for seo",
  "keyword clustering for seo",
  "best keyword research tool",
  "keyword research tool free",
  "rank tracking tool",
  "best rank tracking software",
  "how to track keyword rankings",
];

const result = clusterKeywords(input);
console.log(JSON.stringify(result, null, 2));
