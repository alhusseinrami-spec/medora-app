import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/chat";
import { ChatScreen } from "@/components/chat/ChatScreen";

export const metadata = { title: "Assistant" };

export default async function ChatPage() {
  const { user } = await requireAuth();
  const convs = await db.conversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, updatedAt: true } });
  return <ChatScreen aiReady={aiConfigured()} conversations={convs.map((c) => ({ id: c.id, title: c.title, updated: c.updatedAt.toISOString() }))} />;
}
