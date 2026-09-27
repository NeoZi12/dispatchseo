// The four ways Claude Code can authenticate, compared for the one thing a
// headless run cares about: does it work with no browser and no human to
// click through a device-code flow. Sourced from code.claude.com/docs/en/env-vars
// (fetched while writing this guide) plus this repo's own
// .github/workflows/seo-daily.yml, which is the CLAUDE_CODE_OAUTH_TOKEN row.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    method: "ANTHROPIC_API_KEY",
    how: "Created at console.anthropic.com; sent as the X-Api-Key header",
    billing: "Metered - pay per token on the API account",
    headless: "Yes - drop it in as a CI secret, nothing else required",
  },
  {
    method: "ANTHROPIC_AUTH_TOKEN",
    how: "Set by hand, usually pointing at a proxy or gateway in front of the API",
    billing: "Sent as a Bearer Authorization header - billing depends on the gateway",
    headless: "Yes, once the gateway itself is reachable from the runner",
  },
  {
    method: "CLAUDE_CODE_OAUTH_TOKEN",
    how: "Minted once with claude setup-token (needs an active Claude subscription)",
    billing: "Rides the existing Pro/Max subscription instead of metered billing",
    headless: "Yes - this is what runs DispatchSEO's own daily guide-builder",
  },
  {
    method: "Interactive OAuth login",
    how: "claude auth login - a browser-based device flow tied to a human session",
    billing: "Same subscription as the token above",
    headless: "No - there's no browser in a runner to complete it",
  },
] as const;

export function AuthMethodCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Method</Th>
          <Th>How it's set</Th>
          <Th>Billing</Th>
          <Th>Works headless?</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.method}>
              <Td className="font-medium text-neutral-100">{r.method}</Td>
              <Td>{r.how}</Td>
              <Td>{r.billing}</Td>
              <Td>{r.headless}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
