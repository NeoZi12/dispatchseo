import { saveHostedBlog } from "@/app/autopilot-actions";
import { ActionForm } from "@/components/ui/action-form";
import { manualSnippet } from "@/lib/hosted-rewrite";
import type { HostedTheme } from "@/lib/hosted-theme";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OnAir } from "@/components/ui/on-air";

// THE HOSTED BLOG. This site has no blog of its own, so we serve /blog for
// it (src/lib/hosted-blog.ts). Two facts the owner needs: does their domain
// forward to us yet (checked live, by the marker header our pages send), and
// how the blog looks - accent, light/dark, logo, and the button under every
// article. Shared by both Settings renders (agent and hosted mode).
export function HostedBlogCard(props: {
  slug: string;
  domain: string;
  hostedKey: string;
  prUrl: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  live: boolean;
  backend: string;
  theme: HostedTheme;
  /** Fold the look form (accent, logo, button) behind one line - the hosted
   *  Settings page shows only what may need doing; the agent page keeps it
   *  open as before. */
  lookCollapsed?: boolean;
}) {
  const blogUrl = `https://${props.domain}/blog`;
  return (
    <div className="rounded-xl border border-line-soft bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Your blog, served by DispatchSEO</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Your site has no blog of its own, so we serve one at{" "}
            <a href={blogUrl} className="text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink-muted" target="_blank" rel="noreferrer">
              {blogUrl}
            </a>
            , under your domain, with your site name and a link back to your site on every article.
          </p>
        </div>
        {/* Same signal as the report's "Autopilot on": transmitting once
            your domain's /blog reaches us, still until then. */}
        <OnAir on={props.live}>{props.live ? "Forwarding live" : "Not forwarding yet"}</OnAir>
      </div>
      <ForwardingHelp live={props.live} prUrl={props.prUrl} backend={props.backend} hostedKey={props.hostedKey} className="mt-3" />

      {props.lookCollapsed ? (
        <details className="group mt-5 border-t border-line-soft pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60 [&::-webkit-details-marker]:hidden">
            Change how the blog looks
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <LookForm {...props} className="mt-5" />
        </details>
      ) : (
        <LookForm {...props} className="mt-6 border-t border-line-soft pt-5" />
      )}
    </div>
  );
}

/** What to do while the domain's /blog doesn't reach us yet: merge the PR,
 *  or add the rule for your host (folded). Nothing once it's live. */
export function ForwardingHelp({
  live,
  prUrl,
  backend,
  hostedKey,
  className = "",
}: {
  live: boolean;
  prUrl: string | null;
  backend: string;
  hostedKey: string;
  className?: string;
}) {
  if (live) return null;
  const snippets = manualSnippet(backend, hostedKey);
  const manual = prUrl === "manual" || !prUrl;
  return (
    <div className={className}>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {manual ? "Add the rule below to your site and deploy. This turns green on its own." : "Merge the pull request and deploy. This turns green on its own."}{" "}
        {!manual ? (
          <a href={prUrl!} className="font-medium text-accent underline decoration-accent/40 underline-offset-[3px]" target="_blank" rel="noreferrer">
            Open the pull request
          </a>
        ) : null}
      </p>
      {manual ? (
        <details className="mt-3 text-[13px] text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink">The forwarding rule for your host</summary>
          <p className="mt-3">Vercel (vercel.json)</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-ink">{snippets.vercel}</pre>
          <p className="mt-3">Netlify (_redirects)</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-ink">{snippets.netlify}</pre>
          <p className="mt-3">Next.js anywhere else (next.config)</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-ink">{snippets.next}</pre>
        </details>
      ) : null}
    </div>
  );
}

/** The hosted blog's look: accent, light/dark, logo, the button under every
 *  article. */
export function LookForm(props: {
  slug: string;
  domain: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  theme: HostedTheme;
  className?: string;
}) {
  return (
    <>
      <ActionForm action={saveHostedBlog} slug={props.slug} submitLabel="Save blog look" className={props.className}>
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <Field id="hosted-accent" label="Accent">
            <input
              id="hosted-accent"
              type="color"
              name="hosted_accent"
              defaultValue={props.theme.accent}
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2 p-1"
            />
          </Field>
          <Field id="hosted-mode" label="Look">
            <Select id="hosted-mode" name="hosted_mode" defaultValue={props.theme.mode}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
        </div>
        <Field id="hosted-logo" label="Logo" hint="A full https:// image address. Leave empty to show your site name.">
          <Input id="hosted-logo" type="url" name="hosted_logo" defaultValue={props.theme.logo ?? ""} placeholder="https://" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_14rem]">
          <Field id="hosted-cta-url" label="Button link" hint="A page on your own site. Empty links to your homepage.">
            <Input id="hosted-cta-url" type="url" name="hosted_cta_url" defaultValue={props.ctaUrl ?? ""} placeholder={`https://${props.domain}/`} />
          </Field>
          <Field id="hosted-cta-label" label="Button text">
            <Input id="hosted-cta-label" type="text" name="hosted_cta_label" defaultValue={props.ctaLabel ?? ""} placeholder="Try it free" maxLength={60} />
          </Field>
        </div>
      </ActionForm>
      <p className="mt-3 text-[12.5px] text-ink-faint">
        Colours and logo were {props.theme.source === "site" ? "read from your homepage" : props.theme.source === "owner" ? "set by you" : "left at the defaults"}.
      </p>
    </>
  );
}
