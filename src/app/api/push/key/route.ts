import { apiAuth } from "@/lib/auth";
import { json } from "@/lib/http";
import { getVapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";

// The VAPID public key the browser needs to subscribe. It is public by design; the private key never leaves the server.
export async function GET() {
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const { publicKey } = await getVapidKeys();
  return json({ publicKey });
}
