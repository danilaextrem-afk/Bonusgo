"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingText = "Подождите…",
  className = "btn-primary",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const ctx = useContext(PendingContext);
  const busy = pending || ctx;
  return (
    <button type="submit" disabled={busy} aria-busy={busy} className={className}>
      {busy ? pendingText : children}
    </button>
  );
}
