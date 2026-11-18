import { billing } from "../../_util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Informational redirect only: money status is decided by the signed ResultURL notification, never by this page.
export const GET = () => billing("success");
export const POST = () => billing("success");
