#!/usr/bin/env node
import { probeRender } from "./lib/render-probe.mjs";

const result = await probeRender({ expectedSha: process.env.GITHUB_SHA });
if (result.ok) {
  console.log("Render publication verified:", result.revision, "in", result.attempts, "attempt(s)");
} else {
  console.error("Render publication not confirmed.");
  console.error("Reason:", result.code, "| attempts:", result.attempts);
  if (result.code === "HTTP_503")
    console.error("Render returned 503: inspect Deploys, Events, instance status and startup logs.");
  if (result.code === "MISMATCH")
    console.error("Published revision:", result.found, "| selected GitHub revision:", result.expected);
  if (result.code === "INVALID_REVISION")
    console.error("Missing/invalid Render revision. Confirm a Git-linked Render deployment.");
  process.exitCode = 1;
}
