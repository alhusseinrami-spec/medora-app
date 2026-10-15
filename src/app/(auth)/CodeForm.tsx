"use client";
import { useActionState } from "react";
import type { FormState } from "./actions";
import { Field, FormMessage, Submit } from "@/components/ui/FormBits";

export function CodeForm({ act, cta }: { act: (s: FormState, f: FormData) => Promise<FormState>; cta: string }) {
  const [state, action] = useActionState(act, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="6-digit code"><input className="input text-center tracking-[.4em] text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus /></Field>
      <FormMessage state={state} />
      <Submit pendingText="Checking…">{cta}</Submit>
    </form>
  );
}
