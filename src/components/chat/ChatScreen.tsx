"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { Icon } from "@/components/ui/Icon";

export function ChatScreen({ aiReady, conversations }: { aiReady: boolean; conversations: { id: string; title: string; updated: string }[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  useEffect(() => { try { setCurrent(localStorage.getItem("medora-conv")); } catch { setCurrent(null); } }, []);
  const pick = (id: string | null) => { setCurrent(id); try { if (id) localStorage.setItem("medora-conv", id); else localStorage.removeItem("medora-conv"); } catch {} };
  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[calc(100dvh-56px-48px)]">
      <aside className="card overflow-hidden hidden md:flex flex-col" aria-label="Conversations">
        <div className="p-3 border-b border-line"><button className="btn btn-primary w-full" onClick={() => pick(null)}><Icon name="plus" size={18} />New conversation</button></div>
        <ul className="flex-1 overflow-auto py-1">
          {conversations.map((c) => (
            <li key={c.id}><button onClick={() => pick(c.id)} className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-2 ${current === c.id ? "bg-teal-soft font-semibold" : ""}`}>
              <span className="block truncate">{c.title}</span><span className="text-xs text-muted">{new Date(c.updated).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </button></li>
          ))}
          {!conversations.length && <li className="empty">No conversations yet.</li>}
        </ul>
      </aside>
      <section className="card overflow-hidden flex flex-col min-h-0" aria-label="Assistant">
        {current !== undefined && <ChatPanel aiReady={aiReady} conversationId={current} onConversation={(id) => { if (id && id !== current) { setCurrent(id); router.refresh(); } if (!id) setCurrent(null); }} />}
      </section>
    </div>
  );
}
