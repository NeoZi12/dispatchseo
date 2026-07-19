import { AsyncLocalStorage } from "node:async_hooks";
import type { Project } from "./projects";

// Request-scoped project for the MCP tools. The auth wrapper resolves the
// bearer token to a project and runs the handler inside this store, so every
// tool callback reads currentProject() instead of threading a parameter
// through mcp-handler's registration API.
export const projectStore = new AsyncLocalStorage<Project>();

export function currentProject(): Project {
  const p = projectStore.getStore();
  if (!p) throw new Error("No project resolved for this MCP request");
  return p;
}
