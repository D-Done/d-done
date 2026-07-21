"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, FileText, CalendarDays, Download, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const API = "/api/v1";

type Status = "todo" | "in_progress" | "done";
type Task = {
  id: string; title: string; description: string | null;
  status: Status; due_date: string | null; created_at: string;
  assigned_to_id: string;
};
type User = { id: string; name: string; email: string; role: string };

const STATUS_HE: Record<Status, string> = { todo: "לביצוע", in_progress: "בביצוע", done: "הושלם" };
const STATUS_BADGE: Record<Status, string> = {
  todo: "bg-amber-50 text-amber-700 border border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200",
  done: "bg-green-50 text-green-700 border border-green-200",
};
const STATUS_BORDER: Record<Status, string> = {
  todo: "border-r-amber-400",
  in_progress: "border-r-blue-400",
  done: "border-r-green-400",
};
const STATUS_ICON: Record<Status, React.ElementType> = {
  todo: Clock,
  in_progress: AlertCircle,
  done: CheckCircle2,
};
const STATUS_ICON_COLOR: Record<Status, string> = {
  todo: "#f59e0b",
  in_progress: "#3b82f6",
  done: "#22c55e",
};

function toDateStr(iso: string) { return iso.slice(0, 10); }

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function formatHebrew(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

export default function SummaryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [date, setDate] = useState(todayStr());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (u: User) => {
    const res = await fetch(`${API}/team/tasks`, { headers: { "x-dev-email": u.email } });
    if (res.ok) {
      const all: Task[] = await res.json();
      setTasks(all.filter((t) => t.assigned_to_id === u.id));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/"); return; }
    const u: User = JSON.parse(saved);
    setUser(u);
    load(u);
  }, [load, router]);

  if (!user) return null;

  const dueOnDay = tasks.filter((t) => t.due_date && toDateStr(t.due_date) === date);
  const dueIds = new Set(dueOnDay.map((t) => t.id));
  const openedOnDay = tasks.filter((t) => toDateStr(t.created_at) === date && !dueIds.has(t.id));
  const allDay = [...dueOnDay, ...openedOnDay];
  const doneCount = allDay.filter((t) => t.status === "done").length;

  function buildCopyText() {
    const lines: string[] = [
      `סיכום עבודה — ${formatHebrew(date)}`,
      `עורך/ת דין: ${user!.name}`,
      "",
    ];
    if (dueOnDay.length > 0) {
      lines.push("משימות שמועדן היום:");
      dueOnDay.forEach((t) => lines.push(`  • ${t.title} — ${STATUS_HE[t.status]}`));
      lines.push("");
    }
    if (openedOnDay.length > 0) {
      lines.push("משימות שנפתחו היום:");
      openedOnDay.forEach((t) => lines.push(`  • ${t.title} — ${STATUS_HE[t.status]}`));
      lines.push("");
    }
    if (allDay.length === 0) lines.push("לא נמצאו משימות ביום זה.", "");
    lines.push("──────────────────────");
    lines.push(`סה״כ: ${allDay.length} משימות  |  הושלמו: ${doneCount}`);
    return lines.join("\n");
  }

  function copy() {
    navigator.clipboard.writeText(buildCopyText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportExcel() {
    const bom = "﻿";
    const headers = ["כותרת משימה", "תיאור", "סטטוס", "קטגוריה", "תאריך יעד", "שעות (למילוי)"];
    const rows = allDay.map((t) => [
      t.title,
      t.description ?? "",
      STATUS_HE[t.status],
      dueIds.has(t.id) ? "מועד היום" : "נפתח היום",
      t.due_date ? formatDateShort(t.due_date) : "",
      "",
    ]);
    const csv = bom + [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `סיכום-${user!.name}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isToday = date === todayStr();
  const isYesterday = date === yesterdayStr();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#33004e" }}>סיכום יומי</h1>
        <p className="text-sm mt-1" style={{ color: "#9a6ad7" }}>ייצוא משימות לחיוב שעות בלויאל</p>
      </div>

      {/* Date picker */}
      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "#e8d8f4" }}>
        <div className="flex flex-wrap items-center gap-3">
          <CalendarDays className="w-4 h-4 shrink-0" style={{ color: "#dcba44" }} />
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            max={todayStr()}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            style={{ borderColor: "#d8c0ec", color: "#33004e" }}
          />
          <div className="flex gap-2">
            {!isToday && (
              <button onClick={() => setDate(todayStr())}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-purple-50"
                style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                היום
              </button>
            )}
            {!isYesterday && (
              <button onClick={() => setDate(yesterdayStr())}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-purple-50"
                style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                אתמול
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary header */}
      <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ background: "#1a0028" }}>
        <div>
          <p className="font-bold text-white text-base">{formatHebrew(date)}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs" style={{ color: "#9a6ad7" }}>{allDay.length} משימות</span>
            <span className="text-xs" style={{ color: "#22c55e" }}>{doneCount} הושלמו</span>
            <span className="text-xs" style={{ color: "#f59e0b" }}>{allDay.length - doneCount} פתוחות</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={copy} disabled={allDay.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: copied ? "#22c55e" : "#33004e", color: "#fff" }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "הועתק!" : "העתק"}
          </button>
          <button onClick={exportExcel} disabled={allDay.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: "#dcba44", color: "#1a0028" }}>
            <Download className="w-3.5 h-3.5" />
            ייצא לאקסל
          </button>
        </div>
      </div>

      {/* Task list */}
      {allDay.length === 0 ? (
        <div className="bg-white rounded-2xl border py-16 text-center" style={{ borderColor: "#e8d8f4" }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "#e8d8f4" }} />
          <p className="text-sm font-medium text-slate-500">לא נמצאו משימות ביום זה</p>
          <p className="text-xs text-slate-300 mt-1">מוצגות משימות שמועדן בתאריך זה ומשימות שנפתחו בו</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dueOnDay.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: "#9a6ad7" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#9a6ad7" }} />
                מועד היום
              </p>
              <div className="space-y-2">
                {dueOnDay.map((t) => {
                  const Icon = STATUS_ICON[t.status];
                  return (
                    <div key={t.id}
                      className={`bg-white rounded-xl border-r-4 border border-slate-100 shadow-sm p-4 ${STATUS_BORDER[t.status]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: "#33004e" }}>{t.title}</p>
                          {t.description && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>
                          )}
                        </div>
                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_BADGE[t.status]}`}>
                          <Icon className="w-3 h-3" style={{ color: STATUS_ICON_COLOR[t.status] }} />
                          {STATUS_HE[t.status]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openedOnDay.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: "#9a6ad7" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#dcba44" }} />
                נפתחו ביום זה
              </p>
              <div className="space-y-2">
                {openedOnDay.map((t) => {
                  const Icon = STATUS_ICON[t.status];
                  return (
                    <div key={t.id}
                      className={`bg-white rounded-xl border-r-4 border border-slate-100 shadow-sm p-4 ${STATUS_BORDER[t.status]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: "#33004e" }}>{t.title}</p>
                          {t.description && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>
                          )}
                        </div>
                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_BADGE[t.status]}`}>
                          <Icon className="w-3 h-3" style={{ color: STATUS_ICON_COLOR[t.status] }} />
                          {STATUS_HE[t.status]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
