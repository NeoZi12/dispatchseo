// Shared by the server section and the client visit table.

export const VERDICT: Record<"person" | "bot" | "unsure", { word: string; color: string; cls: string }> = {
  person: { word: "Human", color: "var(--color-ok)", cls: "border-ok/30 bg-ok/10 text-ok" },
  unsure: { word: "Unsure", color: "#5c5c5c", cls: "border-line bg-surface-2 text-ink-muted" },
  bot: { word: "Bot", color: "var(--color-warn)", cls: "border-warn/30 bg-warn/10 text-warn" },
};

export const KIND_COLOR: Record<"ai" | "search" | "social" | "direct" | "site" | "campaign" | "badge", string> = {
  badge: "#f472b6",
  ai: "var(--color-accent)",
  search: "var(--color-info)",
  social: "var(--color-ok)",
  campaign: "var(--color-warn)",
  site: "var(--color-ink-muted)",
  direct: "#5c5c5c",
};

export const KIND_NAME: Record<keyof typeof KIND_COLOR, string> = {
  ai: "AI",
  search: "Search",
  social: "Social",
  campaign: "Tagged link",
  badge: "Made with DispatchSEO",
  site: "Other site",
  direct: "Direct",
};

const FLAG_BASE = 0x1f1e6;
export function flag(code: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(FLAG_BASE + code.charCodeAt(0) - 65, FLAG_BASE + code.charCodeAt(1) - 65);
}

const REGION = new Intl.DisplayNames(["en"], { type: "region" });
export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return REGION.of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryLabel(code: string | null): string {
  return `${flag(code)}  ${countryName(code)}`.trim();
}
