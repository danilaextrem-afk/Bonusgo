import { createHash } from "node:crypto";

/** The fingerprint describes only the effective action, not a replaceable QR.
 * It is stored with the original transaction, making later retries comparable
 * even when a program's reward text, price or percentage is edited.
 */
export type LoyaltyIntent = {
  action: "ACCRUE" | "REDEEM";
  programId: string;
  kind: "stamps" | "purchase" | "stamp-reward" | "reward";
  value: number | string | null;
};

export function loyaltyIntentFingerprint(intent: LoyaltyIntent): string {
  return createHash("sha256")
    .update(JSON.stringify(["qronus-loyalty-intent-v1", intent.action, intent.programId, intent.kind, intent.value]), "utf8")
    .digest("hex");
}
