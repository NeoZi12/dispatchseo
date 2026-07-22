// Cloud/self-host mode split. Self-host is the default: single owner, one
// password (dashboard-auth.ts). CLOUD_MODE="true" flips the deployment to
// multi-user: Supabase Auth accounts (cloud-auth.ts), per-user project
// ownership (projects.owner_user_id, migration 0031), and billing. The flag
// is read at request time so both paths stay live in one codebase - never
// branch on it at module scope.
export function isCloudMode(): boolean {
  return process.env.CLOUD_MODE === "true";
}
