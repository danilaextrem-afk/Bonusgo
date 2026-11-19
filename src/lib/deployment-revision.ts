/**
 * Expose only a short, validated public Git commit identifier.
 * Render supplies RENDER_GIT_COMMIT for linked Git deployments.
 * Malformed or absent values are not returned.
 */
export function publicDeploymentRevision(commit: string | undefined): string | null {
  return typeof commit === "string" && /^[a-fA-F0-9]{40}$/.test(commit)
    ? commit.slice(0, 12).toLowerCase()
    : null;
}
