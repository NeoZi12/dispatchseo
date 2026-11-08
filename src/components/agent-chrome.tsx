"use client";

import dynamic from "next/dynamic";

// The dashboard shell's agent-mode and self-host chrome, loaded on demand.
//
// Why a client module: Turbopack puts every client component the SERVER
// graph can reach - through a static import, a server-side import() or
// next/dynamic alike - into the page's eager script list (measured
// 2026-11-08: a next/dynamic in the layout changed nothing). Only an import()
// made from a CLIENT module becomes its own chunk, fetched when the component
// first renders. So the layout renders these thin wrappers, and a hosted
// project - which shows none of them - never downloads the agent switch and
// the connect-command builders behind it, the mode switch, or the setup bars.
export const AgentHeaderSwitch = dynamic(() => import("./agent-header-switch").then((m) => m.AgentHeaderSwitch));
export const ModeSwitch = dynamic(() => import("./mode-switch").then((m) => m.ModeSwitch));
export const SetupProgressBanner = dynamic(() => import("./setup-progress-banner").then((m) => m.SetupProgressBanner));
export const SetupPageBar = dynamic(() => import("./setup-path/page-bar").then((m) => m.SetupPageBar));
