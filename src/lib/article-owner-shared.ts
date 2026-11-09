// The two things the owner's article controls share between server and
// browser: nothing in here may import a server module (article-owner.ts
// carries db, GitHub and WordPress - the editor's client bundle must not).

/** Which way an article went out, and so which way a change to it goes. */
export type ArticleRoute = "hosted" | "repo" | "wordpress";

export const EDIT_LIMITS = { title: 200, metaDescription: 320, bodyMin: 100, bodyMax: 200_000 } as const;
