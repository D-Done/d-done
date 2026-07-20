"use client";

import { useEffect, useRef } from "react";

export type Status = "todo" | "in_progress" | "done";

export const STATUS_LABEL: Record<Status, string> = { todo: "לביצוע", in_progress: "בביצוע", done: "הושלם" };
export const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
};
const DOT: Record<Status, string> = { todo: "#f59e0b", in_progress: "#6366f1", done: "#22c55e" };

export function StatusPicker({ current, onSelect, onClose }: {
  current: Status;
  onSelect: (s: Status) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div ref={ref} dir="rtl"
      className="absolute top-full mt-1 right-0 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 min-w-[130px]"
      onClick={e => e.stopPropagation()}>
      {(["todo", "in_progress", "done"] as Status[]).map(s => (
        <button key={s} onClick={() => onSelect(s)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 ${s === current ? "opacity-50 pointer-events-none" : ""}`}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT[s] }} />
          <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>
          {s === current && <span className="text-slate-400 text-[10px] mr-auto">נוכחי</span>}
        </button>
      ))}
    </div>
  );
}
