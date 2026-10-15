"use client";
import { useActionState } from "react";
import { login } from "../actions";
import { Field, FormMessage, Submit } from "@/components/ui/FormBits";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email"><input className="input" name="email" type="email" autoComplete="username" required autoFocus defaultValue={state?.values?.email} /></Field>
      <Field label="Password"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <Submit pendingText="Signing in…">Sign in</Submit>
    </form>
  );
}
