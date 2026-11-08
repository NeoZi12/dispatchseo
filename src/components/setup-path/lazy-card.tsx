"use client";

import dynamic from "next/dynamic";

// The setup step card, loaded when it first renders. It carries the motion
// library (~45 KB gzipped) and only an agent-mode Home with setup left ever
// shows it; see components/agent-chrome.tsx for why the import() has to be
// made from a client module to keep it out of every page's scripts.
export const SetupStepCard = dynamic(() => import("./step-card").then((m) => m.SetupStepCard));
