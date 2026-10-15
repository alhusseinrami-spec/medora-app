"use client";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createTaskAction, deleteTaskAction, moveTaskAction, updateTaskAction } from "@/app/(app)/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Drawer } from "@/components/ui/Drawer";

export type Status = "TODO" | "DOING" | "WAITING" | "DONE";
export type TaskRow = { id: string; title: string; notes: string; status: Status; priority: "P1" | "P2" | "P3" | "P4"; due: string | null; ownerId: string; assigneeId: string | null; assignee: string | null; source: string; position: number };

const COLS: { id: Status; label: string }[] = [{ id: "TODO", label: "To do" }, { id: "DOING", label: "In progress" }, { id: "WAITING", label: "Waiting on others" }, { id: "DONE", label: "Done" }];
const PRI_CHIP: Record<string, string> = { P1: "chip-danger", P2: "chip-warn", P3: "", P4: "" };

function dueChip(due: string | null, today: string, done: boolean) {
  if (!due) return null;
  const d = new Date(due + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (done) return <span className="chip">{d}</span>;
  if (due < today) return <span className="chip chip-danger">Overdue · {d}</span>;
  if (due === today) return <span className="chip chip-warn">Today</span>;
  return <span className="chip">{d}</span>;
}

function Card({ t, today, onOpen, overlay = false }: { t: TaskRow; today: string; onOpen: (id: string) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, data: { status: t.status } });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-task={t.id}
      className={`card !rounded-xl p-3 flex gap-2 bg-surface ${isDragging && !overlay ? "opacity-40" : ""} ${overlay ? "shadow-xl rotate-1" : ""}`}>
      <button {...attributes} {...listeners} className="text-muted cursor-grab active:cursor-grabbing touch-none -ms-1 self-start mt-0.5" aria-label={`Drag ${t.title}`}><Icon name="grip" size={18} /></button>
      <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(t.id)}>
        <div className={`font-medium leading-snug ${t.status === "DONE" ? "line-through text-muted" : ""}`}>{t.title}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className={`chip ${PRI_CHIP[t.priority]}`}>{t.priority}</span>
          {dueChip(t.due, today, t.status === "DONE")}
          {t.assignee && <span className="chip chip-teal">{t.assignee}</span>}
          {t.source === "assistant" && <span className="chip" title="Created by the assistant"><Icon name="sparkle" size={12} />AI</span>}
        </div>
      </button>
    </li>
  );
}

function Column({ col, tasks, today, onOpen, onAdd }: { col: { id: Status; label: string }; tasks: TaskRow[]; today: string; onOpen: (id: string) => void; onAdd: (s: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}`, data: { status: col.id } });
  return (
    <section className={`rounded-2xl bg-surface-2 p-2.5 flex flex-col min-h-[180px] ${isOver ? "ring-2 ring-teal" : ""}`} aria-label={col.label} data-col={col.id}>
      <div className="flex items-center justify-between px-1.5 pb-2">
        <h2 className="font-semibold text-sm">{col.label} <span className="text-muted font-normal">{tasks.length}</span></h2>
        <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => onAdd(col.id)} aria-label={`Add to ${col.label}`}><Icon name="plus" size={16} /></button>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex-1 space-y-2 min-h-[60px]">
          {tasks.map((t) => <Card key={t.id} t={t} today={today} onOpen={onOpen} />)}
          {!tasks.length && <li className="text-xs text-muted text-center py-6 border border-dashed border-line rounded-xl">Drop tasks here</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

export function TaskBoard({ initial, me, team, today, canSeeTeam, openId, startNew }: { initial: TaskRow[]; me: string; team: { id: string; name: string }[]; today: string; canSeeTeam: boolean; openId: string | null; startNew: boolean }) {
  const [tasks, setTasks] = useState(initial);
  useEffect(() => setTasks(initial), [initial]);
  const [view, setView] = useState<"board" | "list">("board");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [newStatus, setNewStatus] = useState<Status>("TODO");
  const [dragId, setDragId] = useState<string | null>(null);
  const dndId = useId(); // stable accessibility ids so server and browser HTML match
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  useEffect(() => { try { const v = localStorage.getItem("medora-task-view"); if (v === "list" || v === "board") setView(v); } catch {} }, []);
  useEffect(() => { if (startNew) setEditing("new"); else if (openId) { const t = initial.find((x) => x.id === openId); if (t) setEditing(t); } }, [openId, startNew, initial]);

  const visible = useMemo(() => tasks.filter((t) => (scope === "all" || t.ownerId === me || t.assigneeId === me) && (!q || (t.title + " " + t.notes).toLowerCase().includes(q.toLowerCase()))), [tasks, scope, q, me]);
  const byCol = (s: Status) => visible.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id), overId = String(over.id);
    const moving = tasks.find((t) => t.id === id);
    if (!moving) return;
    const status = (over.data.current?.status ?? moving.status) as Status;
    const col = byCol(status).filter((t) => t.id !== id);
    let beforeId: string | null = null;
    if (!overId.startsWith("col:") && overId !== id) {
      const sameCol = moving.status === status;
      const full = byCol(status);
      const oldI = full.findIndex((t) => t.id === id), overI = full.findIndex((t) => t.id === overId);
      beforeId = sameCol && oldI < overI ? col[col.findIndex((t) => t.id === overId) + 1]?.id ?? null : overId;
    } else if (overId === id) return;
    // Optimistic position, then the server decides the stored order.
    const i = beforeId ? col.findIndex((t) => t.id === beforeId) : col.length;
    const prev = col[i - 1]?.position ?? (col[0]?.position ?? 1) - 1, next = col[i]?.position ?? prev + 2;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status, position: (prev + next) / 2 } : t)));
    start(async () => { const r = await moveTaskAction(id, status, beforeId); if (r.error) { setErr(r.error); setTasks(initial); } });
  };

  const setView2 = (v: "board" | "list") => { setView(v); try { localStorage.setItem("medora-task-view", v); } catch {} };
  const dragging = dragId ? tasks.find((t) => t.id === dragId) : null;

  return (
    <>
      <PageHeader title="Tasks" sub={`${visible.filter((t) => t.status !== "DONE").length} open${visible.filter((t) => t.status !== "DONE" && t.due && t.due < today).length ? ` · ${visible.filter((t) => t.status !== "DONE" && t.due && t.due < today).length} overdue` : ""}`}
        actions={<button className="btn btn-primary" onClick={() => { setNewStatus("TODO"); setEditing("new"); }}><Icon name="plus" size={18} />New task</button>} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="input !w-[240px]" placeholder="Filter tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tasks" />
        {canSeeTeam && (
          <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Whose tasks">
            {(["mine", "all"] as const).map((s) => <button key={s} className={`px-3 h-9 text-sm font-medium ${scope === s ? "bg-teal text-white" : "bg-surface"}`} aria-pressed={scope === s} onClick={() => setScope(s)}>{s === "mine" ? "Mine" : "Everyone"}</button>)}
          </div>
        )}
        <div className="flex-1" />
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="View">
          <button className={`px-3 h-9 text-sm inline-flex items-center gap-1 ${view === "board" ? "bg-teal text-white" : "bg-surface"}`} aria-pressed={view === "board"} onClick={() => setView2("board")}><Icon name="board" size={16} />Board</button>
          <button className={`px-3 h-9 text-sm inline-flex items-center gap-1 ${view === "list" ? "bg-teal text-white" : "bg-surface"}`} aria-pressed={view === "list"} onClick={() => setView2("list")}><Icon name="list" size={16} />List</button>
        </div>
      </div>
      {err && <p role="alert" className="err mb-3">{err}</p>}
      {view === "board" ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {COLS.map((c) => <Column key={c.id} col={c} tasks={byCol(c.id)} today={today} onOpen={(id) => setEditing(tasks.find((t) => t.id === id) ?? null)} onAdd={(s) => { setNewStatus(s); setEditing("new"); }} />)}
          </div>
          <DragOverlay>{dragging ? <ul><Card t={dragging} today={today} onOpen={() => {}} overlay /></ul> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3 font-medium w-8"><span className="sr-only">Done</span></th><th className="p-3 font-medium">Task</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Priority</th><th className="p-3 font-medium">Due</th><th className="p-3 font-medium">Assignee</th></tr></thead>
            <tbody>
              {[...visible].sort((a, b) => (a.status === "DONE" ? 1 : 0) - (b.status === "DONE" ? 1 : 0) || (a.due ?? "9") .localeCompare(b.due ?? "9")).map((t) => (
                <tr key={t.id} className="border-t border-line hover:bg-surface-2">
                  <td className="p-3"><input type="checkbox" checked={t.status === "DONE"} aria-label={`Mark ${t.title} done`} onChange={(e) => { const s: Status = e.target.checked ? "DONE" : "TODO"; setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: s } : x))); start(async () => { const r = await updateTaskAction(t.id, { status: s }); if (r.error) setErr(r.error); }); }} /></td>
                  <td className="p-3"><button className={`text-left font-medium hover:underline ${t.status === "DONE" ? "line-through text-muted" : ""}`} onClick={() => setEditing(t)}>{t.title}</button></td>
                  <td className="p-3">{COLS.find((c) => c.id === t.status)?.label}</td>
                  <td className="p-3"><span className={`chip ${PRI_CHIP[t.priority]}`}>{t.priority}</span></td>
                  <td className="p-3">{dueChip(t.due, today, t.status === "DONE") ?? <span className="text-muted">None</span>}</td>
                  <td className="p-3">{t.assignee ?? <span className="text-muted">Me</span>}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={6} className="empty">No tasks match. Add one with New task.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TaskEditor task={editing === "new" ? null : editing} status={newStatus} team={team} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaskEditor({ task, status, team, onClose }: { task: TaskRow | null; status: Status; team: { id: string; name: string }[]; onClose: () => void }) {
  const [f, setF] = useState({ title: task?.title ?? "", notes: task?.notes ?? "", priority: task?.priority ?? "P3", status: task?.status ?? status, due: task?.due ?? "", assigneeId: task?.assigneeId ?? "" });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => start(async () => {
    const data = { ...f, due: f.due || null, assigneeId: team.length ? f.assigneeId || null : undefined };
    const r = task ? await updateTaskAction(task.id, data) : await createTaskAction(data);
    if (r.error) setErr(r.error); else onClose();
  });
  const remove = () => { if (!task || !confirm(`Delete "${task.title}"? This can't be undone.`)) return; start(async () => { const r = await deleteTaskAction(task.id); if (r.error) setErr(r.error); else onClose(); }); };
  return (
    <Drawer title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="block"><span className="label">Title</span><input className="input" value={f.title} onChange={set("title")} required autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Status</span><select className="select" value={f.status} onChange={set("status")}>{COLS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="block"><span className="label">Priority</span><select className="select" value={f.priority} onChange={set("priority")}><option value="P1">P1 · Urgent</option><option value="P2">P2 · High</option><option value="P3">P3 · Normal</option><option value="P4">P4 · Low</option></select></label>
          <label className="block"><span className="label">Due date</span><input className="input" type="date" value={f.due} onChange={set("due")} /></label>
          {team.length > 0 && <label className="block"><span className="label">Assignee</span><select className="select" value={f.assigneeId} onChange={set("assigneeId")}><option value="">Me</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        </div>
        <label className="block"><span className="label">Notes</span><textarea className="textarea" value={f.notes} onChange={set("notes")} rows={5} /></label>
        {err && <p role="alert" className="err">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : task ? "Save" : "Add task"}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <div className="flex-1" />
          {task && <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}><Icon name="trash" size={16} />Delete</button>}
        </div>
      </form>
    </Drawer>
  );
}
