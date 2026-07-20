import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isValidCookie } from "@/lib/dashboard-auth";
import { getActiveProject } from "@/lib/active-project";
import {
  disconnectProject,
  oauthConfigured,
  oauthListSites,
  oauthSampleQuery,
  setTrackedProperty,
} from "@/lib/gsc-oauth";
import { PageHeader, SectionTitle } from "@/components/ui";

// "Connect Google Search Console" (launch plan step 3). One page, three
// states: OAuth env not configured (setup notes), not connected (the button),
// connected (properties + a live 28-day sample proving the roundtrip). This
// page is what the Google verification demo video records. The pipeline's
// service-account path is unaffected either way.

async function disconnect() {
  "use server";
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  const project = await getActiveProject();
  await disconnectProject(project.slug);
  revalidatePath("/google");
}

async function useProperty(formData: FormData) {
  "use server";
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  const siteUrl = String(formData.get("siteUrl") ?? "");
  if (!siteUrl) return;
  const project = await getActiveProject();
  await setTrackedProperty(project.id, siteUrl);
  revalidatePath("/google");
}

export default async function GooglePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  const { error, connected } = await searchParams;
  const project = await getActiveProject();
  const token = project.gsc_oauth_refresh_token;

  let sites: Array<{ siteUrl: string; permissionLevel: string }> = [];
  let sample: Awaited<ReturnType<typeof oauthSampleQuery>> | null = null;
  let sampleSite: string | null = null;
  let readError: string | null = null;
  if (token) {
    try {
      sites = await oauthListSites(token);
      sampleSite =
        sites.find((s) => s.siteUrl === project.gsc_site_url)?.siteUrl ??
        sites[0]?.siteUrl ??
        null;
      if (sampleSite) sample = await oauthSampleQuery(token, sampleSite);
    } catch (e) {
      readError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Google Search Console"
        hint="Connect your Google account so DispatchSEO can read your search data directly - no service account JSON needed."
      />

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Connection failed: {error}
        </div>
      ) : null}
      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Google account connected.
        </div>
      ) : null}

      {!oauthConfigured() ? (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 text-sm text-neutral-300">
          <SectionTitle>OAuth is not configured on this deployment</SectionTitle>
          <p>
            Set <code className="text-neutral-100">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
            <code className="text-neutral-100">GOOGLE_OAUTH_CLIENT_SECRET</code>. Create them in
            Google Cloud Console under APIs &amp; Services → Credentials → OAuth client ID (Web
            application), with this redirect URI:
          </p>
          <p className="font-mono text-xs text-neutral-400">
            https://&lt;your-domain&gt;/api/oauth/google/callback
          </p>
          <p>
            The self-hosted service-account setup keeps working without any of this - OAuth
            connect is an alternative, mainly for the hosted cloud.
          </p>
        </div>
      ) : !token ? (
        <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
          <p className="text-sm text-neutral-300">
            One click, one consent screen. DispatchSEO asks for read-only access to your Search
            Console data (<span className="font-mono text-xs">webmasters.readonly</span>) for{" "}
            <span className="text-neutral-100">{project.name}</span> - it can see clicks,
            impressions, and queries, and can change nothing on your account.
          </p>
          <a
            href="/api/oauth/google/start"
            className="inline-block rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-neutral-950"
          >
            Connect Google Search Console
          </a>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-sm text-emerald-300">
              Connected. DispatchSEO can read Search Console data for the properties below.
            </p>
            <form action={disconnect}>
              <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300">
                Disconnect
              </button>
            </form>
          </div>

          {readError ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Connected, but reading failed: {readError}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <SectionTitle sub="Properties this Google account can read. DispatchSEO tracks the one marked below - if it guessed wrong at onboarding, switch it here.">
                  Your properties
                </SectionTitle>
                <ul className="space-y-1.5 text-sm text-neutral-300">
                  {sites.map((s) => (
                    <li key={s.siteUrl} className="flex items-center gap-2 font-mono text-xs">
                      {s.siteUrl}{" "}
                      <span className="text-neutral-500">({s.permissionLevel})</span>
                      {s.siteUrl === project.gsc_site_url ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-sans text-emerald-300">
                          tracked
                        </span>
                      ) : (
                        <form action={useProperty}>
                          <input type="hidden" name="siteUrl" value={s.siteUrl} />
                          <button className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] font-sans text-neutral-300 hover:border-neutral-500">
                            use this property
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {sample && sampleSite ? (
                <div className="space-y-3">
                  <SectionTitle sub={`Last 28 days for ${sampleSite}`}>
                    Live data check
                  </SectionTitle>
                  <p className="text-sm text-neutral-300">
                    {sample.totals.clicks.toLocaleString()} clicks ·{" "}
                    {sample.totals.impressions.toLocaleString()} impressions
                  </p>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-neutral-500">
                      <tr>
                        <th className="py-1 pr-4 font-normal">Query</th>
                        <th className="py-1 pr-4 font-normal">Clicks</th>
                        <th className="py-1 pr-4 font-normal">Impressions</th>
                        <th className="py-1 font-normal">Position</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-300">
                      {sample.topQueries.map((q) => (
                        <tr key={q.query} className="border-t border-neutral-800/60">
                          <td className="py-1.5 pr-4">{q.query}</td>
                          <td className="py-1.5 pr-4">{q.clicks}</td>
                          <td className="py-1.5 pr-4">{q.impressions}</td>
                          <td className="py-1.5">{q.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
