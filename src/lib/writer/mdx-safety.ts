import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import { isHandlerAttr, safeAgentDest } from "./evidence";

// The MDX allowlist for an article the owner's own agent hands in
// (submit_article). It is parsed with the parser the customer's build uses
// (@mdx-js/mdx, through next-mdx-remote's compile-only serialize), and the
// article is REJECTED - with the lines named - when its tree holds anything
// that runs or reaches code: an import/export, a {...} expression, a
// component with an expression attribute or a spread, an on* handler, a
// javascript:/data: URL, a raw script-like element, a link whose destination
// is not http(s), mailto or a relative path. A parse failure is a rejection
// too. This is the primary check; writer/evidence.ts hardenAgentMdx runs on
// what is stored as a second layer. Security audit 2026-11-08: a regex
// cannot emulate the parser; the tree the build sees can be allowlisted.

export type MdxSafetyVerdict = { ok: true } | { ok: false; problems: string[] };

const DENIED_ELEMENTS = new Set(["script", "iframe", "style", "object", "embed", "form", "meta", "link", "base", "svg", "math", "template", "noscript", "frame", "frameset", "applet"]);
const BAD_SCHEME_RE = /(javascript|vbscript|data|livescript|mocha):/;

type Attr =
  | { type: "mdxJsxAttribute"; name: string; value: string | null | { type: string } }
  | { type: "mdxJsxExpressionAttribute" }
  | { type: string };
type Node = {
  type: string;
  name?: string | null;
  url?: string;
  attributes?: Attr[];
  children?: Node[];
  position?: { start?: { line?: number } };
};

function at(n: Node): string {
  const line = n.position?.start?.line;
  return line ? ` (line ${line})` : "";
}

function flat(s: string): string {
  return s.replace(/[\s\u0000-\u001f\u007f]+/g, "").toLowerCase();
}

function walk(n: Node, problems: string[]): void {
  switch (n.type) {
    case "mdxjsEsm":
      problems.push(`an import or export statement${at(n)}`);
      break;
    case "mdxFlowExpression":
    case "mdxTextExpression":
      problems.push(`a {…} expression${at(n)}`);
      break;
    case "html":
      problems.push(`raw HTML${at(n)}`);
      break;
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      const name = n.name ?? "";
      const shown = name ? `<${name}>` : "a fragment";
      // Lowercase names are HTML elements; a capitalised <Link> is the
      // site's own component and allowed.
      if (name && name === name.toLowerCase() && DENIED_ELEMENTS.has(name)) problems.push(`a ${shown} element${at(n)}`);
      for (const a of n.attributes ?? []) {
        if (a.type === "mdxJsxExpressionAttribute") {
          problems.push(`a spread attribute on ${shown}${at(n)}`);
        } else if (a.type === "mdxJsxAttribute") {
          const attr = a as Extract<Attr, { type: "mdxJsxAttribute" }>;
          if (attr.value && typeof attr.value === "object") problems.push(`an expression attribute ${attr.name}={…} on ${shown}${at(n)}`);
          if (isHandlerAttr(attr.name)) problems.push(`an event handler ${attr.name} on ${shown}${at(n)}`);
          if (typeof attr.value === "string" && BAD_SCHEME_RE.test(flat(attr.value))) problems.push(`a ${attr.value.trim().slice(0, 12)}… URL on ${shown}${at(n)}`);
        }
      }
      break;
    }
    case "link":
    case "image":
    case "definition":
      if (typeof n.url === "string" && !safeAgentDest(n.url)) problems.push(`a link to "${n.url.slice(0, 60)}" - only http(s), mailto and own-site paths are allowed${at(n)}`);
      break;
    default:
      break;
  }
  for (const c of n.children ?? []) walk(c, problems);
}

/** Parses the article as MDX and reports what the allowlist refuses. */
export async function mdxSafety(markdown: string): Promise<MdxSafetyVerdict> {
  const problems: string[] = [];
  const guard = () => (tree: unknown) => walk(tree as Node, problems);
  try {
    await serialize(markdown, {
      // Our guard first: it must see the tree before next-mdx-remote's own
      // plugins strip the very nodes it reports.
      mdxOptions: { remarkPlugins: [remarkGfm, guard], format: "mdx" } as unknown as NonNullable<Parameters<typeof serialize>[1]>["mdxOptions"],
      parseFrontmatter: false,
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n").find((l) => l.trim()) ?? "parse error";
    return { ok: false, problems: [`the article does not compile as MDX: ${msg.slice(0, 200)}`] };
  }
  if (!problems.length) return { ok: true };
  return { ok: false, problems: [...new Set(problems)].slice(0, 8) };
}
