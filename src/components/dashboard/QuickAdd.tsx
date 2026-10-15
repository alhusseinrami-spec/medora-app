"use client";
import { useState, useTransition } from "react";
import { createTaskAction } from "@/app/(app)/actions";

export function QuickAdd({ today }: { today: string }) {
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; start(async () => { const r = await createTaskAction({ title, due: today, priority: "P2" }); setMsg(r); if (!r.error) setTitle(""); }); }}>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for today" aria-label="New task for today" />
      <button className="btn btn-primary" disabled={pending || !title.trim()}>Add</button>
      {msg.error && <span role="alert" className="err self-center">{msg.error}</span>}
    </form>
  );
}
