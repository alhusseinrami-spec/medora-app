import { assetLinks } from "@/lib/services/android-app";

// Digital Asset Links: proves the Medora Care Android app belongs to this site.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(assetLinks(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
