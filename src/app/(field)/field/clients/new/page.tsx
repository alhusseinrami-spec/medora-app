import { ClientForm } from "@/components/field/ClientForm";
import { BackLink } from "@/components/field/BackLink";

export const metadata = { title: "New client" };

export default function NewClientPage() {
  return (
    <div className="space-y-3">
      <BackLink href="/field" />
      <h1 className="text-[22px] font-bold">New client</h1>
      <ClientForm />
    </div>
  );
}
