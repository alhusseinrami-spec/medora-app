"use client";
import { useState, useTransition } from "react";
import { saveLayoutAction } from "@/app/(app)/actions";
import { Icon } from "@/components/ui/Icon";

type Panel = { id: string; title: string; wide: boolean; node: React.ReactNode };

export function DashboardGrid({ panels, layout }: { panels: Panel[]; layout: { order: string[]; hidden: string[] } | null }) {
  const ids = panels.map((p) => p.id);
  const initial = [...(layout?.order ?? []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(layout?.order ?? []).includes(id))];
  const [order, setOrder] = useState(initial);
  const [hidden, setHidden] = useState<string[]>(layout?.hidden ?? []);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const byId = Object.fromEntries(panels.map((p) => [p.id, p]));

  const save = (o: string[], h: string[]) => { setOrder(o); setHidden(h); start(() => { saveLayoutAction({ order: o, hidden: h }); }); };
  const move = (id: string, d: -1 | 1) => {
    const i = order.indexOf(id), j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order]; [o[i], o[j]] = [o[j], o[i]];
    save(o, hidden);
  };
  const toggle = (id: string) => save(order, hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);

  return (
    <>
      <div className="flex justify-end -mt-3 mb-3">
        <button className="btn btn-sm btn-ghost" onClick={() => setEditing((e) => !e)} aria-expanded={editing} aria-controls="customize">
          <Icon name="edit" size={16} />{editing ? "Done" : "Customize dashboard"}
        </button>
      </div>
      {editing && (
        <div id="customize" className="card p-4 mb-4">
          <p className="text-sm text-ink-2 mb-2">Choose which panels to show and their order. This is saved to your account.{pending && " Saving…"}</p>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                <label className="flex-1 flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!hidden.includes(id)} onChange={() => toggle(id)} />{byId[id].title}</label>
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${byId[id].title} up`}>↑</button>
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={`Move ${byId[id].title} down`}>↓</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {order.filter((id) => !hidden.includes(id)).map((id) => (
          <section key={id} className={`card overflow-hidden ${byId[id].wide ? "lg:col-span-2" : ""}`} aria-labelledby={`p-${id}`} data-panel={id}>
            <div className="card-h"><h2 id={`p-${id}`} className="card-t">{byId[id].title}</h2></div>
            {byId[id].node}
          </section>
        ))}
      </div>
    </>
  );
}
