import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  await connection(); // always check the database at request time, never at build time
  if ((await db.user.count()) === 0) redirect("/setup");
  return (
    <>
      <h1 className="text-xl font-bold mb-5">Sign in</h1>
      <LoginForm />
      <p className="text-xs text-muted mt-5">Forgot your password? Ask your administrator to reset it from Settings.</p>
    </>
  );
}
