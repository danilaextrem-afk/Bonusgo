export const CONSENT_KEY = "qronus_cookie_consent";
export const CONSENT_EVENT = "qronus:consent";
export type Consent = "accepted" | "declined";

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(v: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* storage unavailable: choice lives for this page view only */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: v }));
}
