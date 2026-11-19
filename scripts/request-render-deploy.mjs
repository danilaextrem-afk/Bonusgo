#!/usr/bin/env node
import { requestRenderDeploy } from "./lib/render-deploy-hook.mjs";

try {
  const result = await requestRenderDeploy({
    rawHook: process.env.RENDER_DEPLOY_HOOK_URL,
    sha: process.env.GITHUB_SHA,
  });
  if (!result.ok) {
    console.error("Render did not accept deployment request:", result.code);
    process.exitCode = 1;
  } else {
    console.log("Render deployment request accepted:", result.code);
    console.log("This confirms only request acceptance, NOT a completed live deploy.");
    console.log("Run 'Verify published Render revision' after Render finishes.");
  }
} catch (error) {
  // Do not print URLs, hook secrets, provider response bodies or raw exceptions.
  console.error("Deployment refused:", error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
