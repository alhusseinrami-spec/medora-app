import { db } from "../db";

export function notify(userId: string, n: { kind: string; title: string; body?: string; link?: string }) {
  return db.notification.create({ data: { userId, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "" } });
}

export function listNotifications(userId: string, take = 30) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export function markRead(userId: string, ids?: string[]) {
  return db.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
