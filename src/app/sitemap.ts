import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getDocSlugs } from "@/lib/docs";

// Only the public surface belongs here - the dashboard is password-gated
// and should never be crawled.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://dispatchseo.com";
  return [
    { url: `${base}/blog`, changeFrequency: "daily" },
    ...getAllPosts().map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.date),
    })),
    { url: `${base}/docs` },
    ...getDocSlugs().map((slug) => ({ url: `${base}/docs/${slug}` })),
  ];
}
