// The real response headers from a production build of this site's own repo
// (Next.js start, curl -D -), with two throwaway redirects added to
// next.config.ts for the test and then removed. The guide's evidence that
// permanent: true means 308 and permanent: false means 307, and that the
// query string rides along.

const ROWS = [
  { request: "/old-blog/seo-for-saas?utm=x", config: "permanent: true", status: "308 Permanent Redirect", location: "/blog/seo-for-saas?utm=x" },
  { request: "/pricing-old", config: "permanent: true", status: "308 Permanent Redirect", location: "/" },
  { request: "/discord", config: "permanent: false", status: "307 Temporary Redirect", location: "https://discord.gg/D7Eq3hKtKs" },
  { request: "/blog/no-such-page", config: "no rule", status: "404 Not Found", location: "-" },
] as const;

export function RedirectCurlProofTable() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl bg-neutral-900">
      <table className="w-full min-w-[38rem] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-3 font-medium">Request</th>
            <th className="px-4 py-3 font-medium">Rule</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {ROWS.map((r) => (
            <tr key={r.request} className="align-top">
              <td className="px-4 py-3 font-mono text-xs text-neutral-100">{r.request}</td>
              <td className="px-4 py-3 text-neutral-300">{r.config}</td>
              <td className={`px-4 py-3 font-medium ${r.status.startsWith("404") ? "text-amber-300" : "text-emerald-400"}`}>{r.status}</td>
              <td className="px-4 py-3 font-mono text-xs text-neutral-300">{r.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
