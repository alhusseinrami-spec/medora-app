"use client";
import { useActionState } from "react";
import { setupOwner } from "../actions";
import { Field, FormMessage, Submit } from "@/components/ui/FormBits";

export function SetupForm() {
  const [state, action] = useActionState(setupOwner, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name"><input className="input" name="name" autoComplete="name" required defaultValue={state?.values?.name} /></Field>
      <Field label="Work email"><input className="input" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} /></Field>
      <Field label="Password" hint="At least 12 characters, with letters and a number."><input className="input" name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
      <Field label="Confirm password"><input className="input" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <FormMessage state={state} />
      <Submit pendingText="Creating account…">Create owner account</Submit>
    </form>
  );
}
