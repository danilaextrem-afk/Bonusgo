import { randomBytes } from "node:crypto";
/** URL-safe random id (128 bits). */
export function createId(): string {
  return randomBytes(16).toString("base64url");
}
