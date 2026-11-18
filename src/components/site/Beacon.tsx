"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function sourceOf(): "organic" | "referral" | "direct" {
  try {
    const ref = document.referrer;
    if (!ref) return "direct";
    const host = new URL(ref).hostname;
    if (host === window.location.hostname) return "direct";
    if (/(^|\.)(yandex\.|google\.)/.test(host)) return "organic";
    return "referral";
  } catch {
    return "direct";
  }
}

let firstView = true;

/** Tiny page-view beacon for the funnel. Failures are ignored. */
export function Beacon() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const source = firstView ? sourceOf() : "direct";
      firstView = false;
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "page_view", path: pathname, source }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, [pathname]);
  return null;
}
