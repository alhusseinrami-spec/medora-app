import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm text-ink-2"><Icon name="back" size={16} />{label}</Link>;
}
