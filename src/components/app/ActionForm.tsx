"use client";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "./action-types";
import { FormError } from "./FormError";
import { PendingContext } from "./SubmitButton";

/**
 * Form bound to a server action returning ActionState.
 * Submits through a transition (not the form `action` prop) so inputs are NOT cleared on errors.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnOk = false,
  confirm,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        <FormError state={state} />
      </form>
    </PendingContext.Provider>
  );
}
