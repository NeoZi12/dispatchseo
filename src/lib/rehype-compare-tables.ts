// Rehype plugin for blog tables (markdown/GFM tables in src/content/blog).
//
// GFM can only write a header row of <th> and a body of <td>, which reads to
// a machine as a grid of strings with no row labels. Comparison pages are
// read by AI answer engines that lift a row or a cell into an answer, so each
// table gets the semantics a hand-written one would have:
//
//  - header cells get scope="col"
//  - the first cell of every body row becomes <th scope="row"> (the row label)
//  - the column or row that is DispatchSEO gets data-ours, so the page can
//    tint it (the reader should always know which side is ours)
//  - a cell whose text starts with "Yes" / "No" / "None" gets data-v, so the
//    page can put a tick or a dash in front of the word. The word stays: the
//    icon is decoration, the text is what gets quoted.
//
// Pure tree walk, no dependencies, so it runs inside next-mdx-remote's
// compile on the server like remark-gfm does.

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const OURS = /^dispatchseo\b/i;

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function elements(node: HastNode | undefined, tag: string): HastNode[] {
  return (node?.children ?? []).filter((c) => c.type === "element" && c.tagName === tag);
}

function verdictOf(text: string): "yes" | "no" | undefined {
  const t = text.trim();
  if (/^yes\b/i.test(t)) return "yes";
  if (/^(no|none)\b/i.test(t)) return "no";
  return undefined;
}

function upgradeTable(table: HastNode) {
  const thead = elements(table, "thead")[0];
  const tbody = elements(table, "tbody")[0];

  let oursCol = -1;
  for (const tr of elements(thead, "tr")) {
    elements(tr, "th").forEach((th, i) => {
      th.properties = { ...th.properties, scope: "col" };
      // Column 0 labels the row headers, never "our" column.
      if (i > 0 && OURS.test(textOf(th).trim())) {
        oursCol = i;
        th.properties.dataOurs = "true";
      }
    });
  }

  for (const tr of elements(tbody, "tr")) {
    const cells = (tr.children ?? []).filter(
      (c) => c.type === "element" && (c.tagName === "td" || c.tagName === "th"),
    );
    cells.forEach((cell, i) => {
      if (i === 0) {
        cell.tagName = "th";
        cell.properties = { ...cell.properties, scope: "row" };
        if (OURS.test(textOf(cell).trim())) {
          tr.properties = { ...tr.properties, dataOurs: "true" };
        }
        return;
      }
      const v = verdictOf(textOf(cell));
      cell.properties = {
        ...cell.properties,
        ...(v ? { dataV: v } : {}),
        ...(i === oursCol ? { dataOurs: "true" } : {}),
      };
    });
  }
}

function walk(node: HastNode) {
  if (node.type === "element" && node.tagName === "table") upgradeTable(node);
  for (const child of node.children ?? []) walk(child);
}

export function rehypeCompareTables() {
  return (tree: HastNode) => walk(tree);
}
