import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { mfaRequired } from "@/lib/rbac";
import { confirmMfa, mfaEnrolment } from "../../actions";
import { CodeForm } from "../../CodeForm";

export const metadata = { title: "Two-step sign-in" };

export default async function MfaSetupPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.mfaEnabled) redirect("/");
  const e = await mfaEnrolment();
  if (!e) redirect("/");
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Turn on two-step sign-in</h1>
      <p className="text-sm text-ink-2 mb-4">
        {mfaRequired(auth.user.role) ? "Your role needs this to protect company data." : "This protects your account if your password leaks."}{" "}
        Scan the code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the 6-digit code.
      </p>
      <div className="flex justify-center mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-lg bg-white p-2" />
      </div>
      <details className="text-sm mb-4">
        <summary className="cursor-pointer text-ink-2">Can’t scan? Enter this key instead</summary>
        <code data-testid="mfa-secret" className="block mt-2 p-2 rounded-lg bg-surface-2 break-all font-mono text-xs">{e.secret}</code>
      </details>
      <CodeForm act={confirmMfa} cta="Turn on" />
    </>
  );
}
