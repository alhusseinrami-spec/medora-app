import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { verifyMfa, logout } from "../../actions";
import { CodeForm } from "../../CodeForm";

export const metadata = { title: "Verify" };

export default async function VerifyPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.user.mfaEnabled || auth.session.mfaPassed) redirect("/");
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Enter your code</h1>
      <p className="text-sm text-ink-2 mb-5">Open your authenticator app and enter the code for Medora Care.</p>
      <CodeForm act={verifyMfa} cta="Verify" />
      <form action={logout} className="mt-4"><button className="btn btn-ghost btn-sm w-full">Use a different account</button></form>
    </>
  );
}
