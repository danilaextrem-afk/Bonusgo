/**
 * Expose only a short, validated public Git commit identifier.
 * Render supplies RENDER_GIT_COMMIT. The Yandex image embeds QRONUS_GIT_COMMIT.
 * Malformed or absent values are not returned.
 */
export function publicDeploymentRevision(commit: string | undefined): string | null {
  return typeof commit === "string" && /^[a-fA-F0-9]{40}$/.test(commit)
    ? commit.slice(0, 12).toLowerCase()
    : null;
}
