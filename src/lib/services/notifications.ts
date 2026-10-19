import { db } from "../db";
import { log } from "../log";
import { sendPush } from "../push";

// Writes the in-app notification, then pushes it to the user's phones and browsers.
// The push is best effort: if it fails, the in-app notification still stands.
export async function notify(userId: string, n: { kind: string; title: string; body?: string; link?: string }) {
  const row = await db.notification.create({ data: { userId, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "" } });
  try {
    await sendPush(userId, { title: n.title, body: n.body, link: n.link, tag: row.id });
  } catch (e) {
    log.error("push.notify_failed", { error: String(e).slice(0, 300) });
  }
  return row;
}

export function listNotifications(userId: string, take = 30) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export function markRead(userId: string, ids?: string[]) {
  return db.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
