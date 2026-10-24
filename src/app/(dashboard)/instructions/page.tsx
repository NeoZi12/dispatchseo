import { requireDashboard } from "@/lib/auth-gate";
import { redirectIfHosted } from "../mode";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { mcpServerName } from "@/lib/mcp-connect";
import { loadConventions, type ConventionsData } from "@/lib/conventions";
import {
  WORKFLOW_STEPS,
  type WorkflowName,
  type WorkflowStep,
} from "@/lib/instructions";
import { AUTOMATIONS } from "@/lib/automations";
import { normalizeContentPrefs } from "@/lib/content-prefs";
import { Mono, PageHeader, SectionTitle } from "@/components/ui";
import { ContentPrefsEditor, HouseRulesEditor } from "@/components/content-prefs-editor";
import { ToolTemplatePreview, paletteFromTokens } from "@/components/template-previews";

export const dynamic = "force-dynamic";

// The "show, don't tell" page, visual-first: two browser-frame wireframes of
// what actually gets shipped (a guide page, a tool page), painted in the
// tenant's own theme colors from conventions. The rest of the playbook is
// compressed to strips - the proof of personalization is the picture, not
// the prose.

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scheduleFor(automationId: string): string | null {
  return AUTOMATIONS.find((a) => a.id === automationId)?.schedule ?? null;
}

// ---------- proof-of-personalization strip ----------

function FactGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // flex-wrap + min-w-0: a group with enough children (a themed site can
    // report a dozen colour tokens) has to be able to break onto a second line
    // rather than run off the right edge of a 360px screen.
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      {children}
    </div>
  );
}

function FactsStrip({ data, updatedAt }: { data: ConventionsData; updatedAt: string }) {
  const tokens = (data.theme_tokens ?? []).filter((t) => t.value);
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl bg-neutral-900/60 px-4 py-3">
      {tokens.length ? (
        <FactGroup label="Theme">
          <span className="flex flex-wrap items-center gap-1">
            {tokens.map((t) => (
              <span
                key={t.name}
                title={`${t.name} ${t.value}`}
                className="h-5 w-5 rounded-md border border-neutral-700"
                style={{ backgroundColor: t.value }}
              />
            ))}
          </span>
        </FactGroup>
      ) : null}
      {data.voice_rules?.length ? (
        <FactGroup label="Voice">
          <span className="flex flex-wrap gap-1">
            {data.voice_rules.slice(0, 4).map((r) => (
              <span
                key={r}
                className="max-w-56 truncate rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
              >
                {r}
              </span>
            ))}
          </span>
        </FactGroup>
      ) : null}
      {data.stack ? (
        <FactGroup label="Stack">
          <span className="text-xs text-neutral-400">{data.stack}</span>
        </FactGroup>
      ) : null}
      <p className="ml-auto text-xs text-neutral-600">
        Found by your coding agent · {shortDate(updatedAt)}
      </p>
    </div>
  );
}

function SetupCard({ slug }: { slug: string }) {
  return (
    <div className="rounded-xl bg-neutral-900/60 p-5">
      <p className="text-sm font-medium text-neutral-100">Not adapted to this site yet</p>
      <p className="mt-1.5 max-w-2xl text-sm text-neutral-400">
        Run <Mono>/seo-setup</Mono> in your site&apos;s repo - the one DispatchSEO publishes to,
        not this dashboard&apos;s. (No <Mono>/seo-setup</Mono> there yet? The pipeline install
        adds it; until then paste{" "}
        <Mono>{`Call the ${mcpServerName(slug)} MCP tool get_instructions with workflow setup and follow it exactly`}</Mono>
        .) Your coding agent reads your stack, theme, and voice, writes{" "}
        <Mono>.dispatchseo/conventions.md</Mono>, and mirrors the facts here - the previews below
        pick up your colors the moment it does.
      </p>
    </div>
  );
}

// ---------- pipeline strips ----------

function Chevron() {
  return (
    <svg
      viewBox="0 0 8 12"
      className="mx-1 h-2.5 w-2 shrink-0 text-neutral-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l4 4-4 4" />
    </svg>
  );
}

function StepStrip({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-y-1.5">
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-center">
          {i > 0 ? <Chevron /> : null}
          <span
            title={s.plain}
            className="flex items-center gap-1.5 rounded-md bg-neutral-800/60 px-2 py-1 text-xs text-neutral-300"
          >
            <span className="font-mono text-[10px] leading-none text-neutral-500">{i + 1}</span>
            {s.title}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Hero({
  title,
  schedule,
  steps,
  children,
}: {
  title: string;
  schedule: string | null;
  steps: WorkflowStep[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl bg-neutral-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {schedule ? <p className="text-xs text-neutral-500">{schedule}</p> : null}
      </div>
      {children}
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
          How it gets built
        </p>
        <StepStrip steps={steps} />
      </div>
    </div>
  );
}

// The non-hero workflows, one slim row each: name, step titles, cadence.
const SECONDARY: Array<{ workflow: WorkflowName; name: string; schedule: string }> = [
  {
    workflow: "research",
    name: "Finding keywords",
    schedule: scheduleFor("opportunity-scan") ?? "Weekly",
  },
  { workflow: "backlinks", name: "Backlink prospecting", schedule: "On demand" },
  { workflow: "report", name: "Reporting", schedule: "On demand" },
  { workflow: "setup", name: "Setup", schedule: "One-time" },
];

function SecondaryStrip() {
  return (
    <div className="rounded-xl bg-neutral-900/60">
      {SECONDARY.map((row, i) => (
        <div
          key={row.workflow}
          // Below sm the name gets its own line - a fixed w-44 name column
          // next to the step chain left almost no room for it on a 390px
          // row, so the chain rendered as little more than an ellipsis.
          className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 ${
            i > 0 ? "border-t border-neutral-800/70" : ""
          }`}
        >
          <p className="text-sm font-medium text-neutral-100 sm:w-44 sm:shrink-0">{row.name}</p>
          <p className="min-w-0 truncate text-xs text-neutral-400 sm:flex-1">
            {WORKFLOW_STEPS[row.workflow].map((s) => s.title).join(" → ")}
          </p>
          <p className="text-xs text-neutral-600">{row.schedule}</p>
        </div>
      ))}
    </div>
  );
}

export default async function InstructionsPage() {
  await requireDashboard();
  // Hosted writer: this screen belongs to the agent workflow; the hosted
  // dashboard covers it on /dashboard.
  await redirectIfHosted("/dashboard");
  await requireOnboarded();

  const project = await getActiveProject();
  const conventions = await loadConventions(project);
  const palette = paletteFromTokens(conventions?.data.theme_tokens);
  const prefs = normalizeContentPrefs(project.content_prefs);

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <PageHeader
          title="Instructions"
          hint={`How your coding agent builds for ${project.domain} - served live, so every run follows the newest playbook.`}
        />
        <p className="text-sm text-neutral-500">
          Every workflow here has a matching command you can run yourself -{" "}
          <a
            href="/docs/agent-commands"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
          >
            see the agent commands
          </a>
          .
        </p>
        {conventions ? (
          <FactsStrip data={conventions.data} updatedAt={conventions.updatedAt} />
        ) : (
          <SetupCard slug={project.slug} />
        )}
      </div>

      <section className="space-y-4">
        <SectionTitle
          sub={
            conventions
              ? "Previewed in your site's own colors, straight from your theme."
              : "Previewed in placeholder colors until setup runs."
          }
        >
          What it builds for {project.domain}
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Hero
            title="A generated guide"
            schedule={scheduleFor("guide-builder")}
            steps={WORKFLOW_STEPS["build-guide"]}
          >
            <ContentPrefsEditor
              prefs={prefs}
              palette={palette}
              url={`${project.domain}/guides/...`}
              siteName={project.name}
              slug={project.slug}
            />
          </Hero>
          <Hero
            title="A generated tool"
            schedule={scheduleFor("tool-builder")}
            steps={WORKFLOW_STEPS["build-tool"]}
          >
            <ToolTemplatePreview
              palette={palette}
              url={`${project.domain}/tools/...`}
              siteName={project.name}
            />
          </Hero>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle sub="Your standing instructions, in plain English - guides and tools both obey them.">
          House rules
        </SectionTitle>
        <HouseRulesEditor prefs={prefs} slug={project.slug} />
      </section>

      <section className="space-y-4">
        <SectionTitle sub="Same playbook, smaller jobs.">Also in the playbook</SectionTitle>
        <SecondaryStrip />
      </section>
    </div>
  );
}
