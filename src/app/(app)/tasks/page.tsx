import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { dayKey } from "@/lib/time";
import { listTasks } from "@/lib/services/tasks";
import { TaskBoard, type TaskRow } from "@/components/tasks/TaskBoard";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const [tasks, team] = await Promise.all([
    listTasks(user),
    can(user.role, "team.assign") ? db.user.findMany({ where: { disabledAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id, title: t.title, notes: t.notes, status: t.status, priority: t.priority, due: t.due ? dayKey(t.due, user.timeZone) : null,
    ownerId: t.ownerId, assigneeId: t.assigneeId, assignee: t.assignee?.name ?? null, source: t.source, position: t.position,
  }));
  return (
    <TaskBoard
      initial={rows} me={user.id} team={team} today={dayKey(new Date(), user.timeZone)}
      canSeeTeam={can(user.role, "team.view")}
      openId={typeof sp.open === "string" ? sp.open : null} startNew={sp.new === "1"}
    />
  );
}
