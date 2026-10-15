import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  await connection(); // always check the database at request time, never at build time
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Set up your command center</h1>
      <p className="text-sm text-ink-2 mb-5">This creates the owner account. It only appears once, before anyone has signed up.</p>
      <SetupForm />
    </>
  );
}
