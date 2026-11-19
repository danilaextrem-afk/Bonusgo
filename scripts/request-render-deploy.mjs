#!/usr/bin/env node
import { requestRenderDeploy } from "./lib/render-deploy-hook.mjs";

try {
  // Deploy latest commit on Render's linked branch without a ref parameter.
  // GitHub Actions verifies the selected SHA is the latest main and has
  // passed CI before invoking this script.
  const result = await requestRenderDeploy({
    rawHook: process.env.RENDER_DEPLOY_HOOK_URL,
  });
  if (!result.ok) {
    console.error("Render did not accept deployment request:", result.code);
    process.exitCode = 1;
  } else {
    console.log("Render deployment request accepted:", result.code);
    console.log("This does not prove publication or verify Render's linked Git branch.");
    console.log("After deployment completes, run 'Verify published Render revision'.");
  }
} catch (error) {
  // Never echo URLs, secrets, provider bodies or raw exceptions.
  console.error("Deployment refused:", error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
