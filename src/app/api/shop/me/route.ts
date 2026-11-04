import { apiAuth } from "@/lib/auth";
import { json } from "@/lib/http";

// Tells the public shop page whether the person viewing it may edit it (shows the shop's ⚙ Admin).
export async function GET() {
  const auth = await apiAuth("customers.notify");
  return json({ canEdit: !!auth });
}
