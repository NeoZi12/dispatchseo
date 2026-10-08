"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { connectClaudeToken, setAgent, type ConnectClaudeState } from "@/app/actions";
import { agentById, builderAgents, type AgentId } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";
import { CopyBox, ErrorLine, PrereqCallout, inputClass } from "@/components/wizard-ui";
import type { Instruction } from "@/lib/setup-path-core";
import { primaryBtn, RichText, Spinner, useSetupPreview } from "../shared";

// The `agent_credential` step: the one password the overnight builds need.
// The agent is fixed from the owner's earlier answer - no picker in the way -
// and a small "Using a different agent?" link (the engine's `#change-agent`
// instruction) reveals the builder-agent cards for the rare switch.
//
// The engine sends the instructions; this form owns how they look, because
// they are not a numbered list: a prerequisite card, the one command, then
// the paste field.

const PICKER_SUBTITLE: Record<AgentId, string> = {
  claude: "Needs a Claude subscription · builds cost nothing extra, they run on your plan",
  codex: "Needs an OpenAI API key · builds are metered by OpenAI per run",
  cursor: "Runs on your Cursor plan · builds use its API key, nothing extra is billed",
};

const PREREQ_CTA: Record<AgentId, string> = {
  claude: "Install Claude Code",
  codex: "Create an API key",
  cursor: "Open the API keys page",
};

const VERIFY_NOTE: Record<AgentId, string> = {
  claude:
    "Verified in the background once setup starts, so there's no instant green check here. That's expected.",
  codex: "Checked against OpenAI before it's stored, so it takes a second or two.",
  cursor: "Shape-checked before it's stored; the pipeline's token check does the real proving shortly after.",
};

/** "Never used Claude Code before? Install it first" -> title + body. */
function splitPrereq(text: string): { title: string; body: string } {
  const q = text.indexOf("?");
  if (q > 0) return { title: text.slice(0, q + 1), body: text.slice(q + 1).trim() };
  const dot = text.indexOf(". ");
  if (dot > 0) return { title: text.slice(0, dot), body: text.slice(dot + 2).trim() };
  return { title: text, body: "" };
}

export function AgentCredentialForm({
  slug,
  agentId,
  instructions,
  onAgentChange,
  onAgentSaved,
  onSaved,
}: {
  slug: string;
  agentId: AgentId;
  instructions: Instruction[];
  /** Immediately, so the field and the hidden `agent` input follow the pick. */
  onAgentChange: (id: AgentId) => void;
  /** After the switch is stored: the engine's copy for the new agent. */
  onAgentSaved?: () => void;
  onSaved: () => void;
}) {
  const preview = useSetupPreview();
  const agent = agentById(agentId);
  const [state, action, pending] = useActionState<ConnectClaudeState, FormData>(connectClaudeToken, null);
  const [picking, setPicking] = useState(false);
  const [switching, startSwitch] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    if (state && "ok" in state) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function pick(next: AgentId) {
    if (next === agentId) return;
    setSwitchError(null);
    onAgentChange(next);
    if (preview) return;
    startSwitch(async () => {
      try {
        await setAgent(next, slug);
        onAgentSaved?.();
      } catch {
        // The paste below sends its own `agent` field, so the key still lands
        // in the right secret; say it once instead of blocking the screen.
        setSwitchError("Couldn't save the switch just now. Your key will still go to the agent shown.");
      }
    });
  }

  const prereq = instructions.find((i) => i.href && i.href !== "#change-agent");
  const rest = instructions.filter((i) => i !== prereq && i.href !== "#change-agent");
  const change = instructions.find((i) => i.href === "#change-agent");
  const pre = prereq ? splitPrereq(prereq.text) : null;

  return (
    <div className="space-y-5 text-left">
      {prereq && pre ? (
        <PrereqCallout
          title={pre.title}
          body={
            agentId === "claude" ? (
              <>
                {pre.body || "Install it first"} - it takes about 2 minutes. Until you do, the command below prints{" "}
                <code className="font-mono text-neutral-300">command not found</code>.
              </>
            ) : (
              pre.body
            )
          }
          href={prereq.href!}
          cta={PREREQ_CTA[agentId]}
        />
      ) : null}

      <form action={action} className="space-y-4">
        {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
        {/* Name the project and the agent explicitly: this writes the paste
            into a repo as an Actions secret, and neither may be inferred from
            a cookie or a fire-and-forget picker write that may not have
            landed yet. */}
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="agent" value={agentId} />
        {rest.map((ins, i) =>
          ins.copy ? (
            <div key={i} className="space-y-2">
              <p className="text-[15px] font-medium text-neutral-200">
                <RichText text={ins.text} />
              </p>
              <CopyBox text={ins.copy} emphasis />
            </div>
          ) : (
            <p key={i} className="text-[15px] font-medium text-neutral-200">
              <RichText text={ins.text} />
            </p>
          ),
        )}
        <input
          name="token"
          type="password"
          required
          placeholder={agent.credential.placeholder}
          autoComplete="new-password"
          spellCheck={false}
          className={`${inputClass} font-mono`}
          aria-label={`${agent.displayName} key`}
        />
        <p className="text-[13px] leading-relaxed text-neutral-500">{VERIFY_NOTE[agentId]}</p>
        <div className="flex justify-center pt-1">
          <button type="submit" disabled={pending || switching} className={primaryBtn}>
            {pending ? (
              <>
                <Spinner /> Saving the key…
              </>
            ) : (
              "Save the key"
            )}
          </button>
        </div>
      </form>

      {change ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="cursor-pointer text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-300 hover:underline"
          >
            {change.text}
          </button>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {picking ? (
          <motion.div
            key="picker"
            id="change-agent"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
              {builderAgents().map(({ id, displayName }) => (
                <label
                  key={id}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border border-neutral-700 p-3.5 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="agent-pick"
                      value={id}
                      checked={agentId === id}
                      onChange={() => pick(id)}
                      disabled={switching}
                      className="h-4 w-4 shrink-0 accent-violet-500"
                    />
                    <AgentMark id={id} className="h-[18px] w-[18px] shrink-0" />
                    <span className="min-w-0 text-sm font-semibold text-neutral-100">{displayName}</span>
                  </span>
                  <span className="pl-6 text-[13px] leading-relaxed text-neutral-400">{PICKER_SUBTITLE[id]}</span>
                </label>
              ))}
            </div>
            {switchError ? <p className="mt-2 text-center text-xs text-amber-300">{switchError}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
