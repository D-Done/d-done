"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useTeamApi } from "@/hooks/use-team-api";

type Status = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  assigned_to_id: string;
  assigned_to_name: string;
  created_by_name: string | null;
  due_date: string | null;
  created_at: string;
};

type Me = { id: string; name: string; role: string; email: string };

const STATUS_LABEL: Record<Status, string> = { todo: "לביצוע", in_progress: "בביצוע", done: "הושלם" };
const STATUS_NEXT: Record<Status, Status> = { todo: "in_progress", in_progress: "done", done: "todo" };
const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
};
const PRIORITY_LABEL: Record<Priority, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה" };
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "text-slate-400", medium: "text-amber-600", high: "text-red-500",
};

function TaskCard({ task, onCycle }: { task: Task; onCycle: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800 dark:text-zinc-100 text-sm">{task.title}</p>
          {task.description && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{task.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {task.due_date && (
              <span className="text-xs text-slate-400">{new Date(task.due_date).toLocaleDateString("he-IL")}</span>
            )}
            <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          </div>
        </div>
        <button onClick={onCycle}
          className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 ${STATUS_STYLE[task.status]}`}>
          {STATUS_LABEL[task.status]}
        </button>
      </div>
    </div>
  );
}

export default function TeamTasksPage() {
  const { api, sessionToken } = useTeamApi();
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("medium");
  const [fDue, setFDue] = useState("");
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState("");

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [meData, tasksData] = await Promise.all([
        api<Me>("/me"),
        api<Task[]>("/tasks"),
      ]);
      setMe(meData);
      setTasks(tasksData.filter((t) => t.assigned_to_id === meData.id));
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "שגיאה בטעינת הנתונים");
    }
  }, [api, sessionToken]);

  useEffect(() => { load(); }, [load]);

  async function cycleStatus(task: Task) {
    const next = STATUS_NEXT[task.status];
    await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t));
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim() || !me) return;
    setFSaving(true); setFError("");
    try {
      const task = await api<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: fTitle.trim(),
          description: fDesc.trim() || null,
          priority: fPriority,
          assigned_to_id: me.id,
          due_date: fDue ? new Date(fDue).toISOString() : null,
        }),
      });
      setTasks((prev) => [task, ...prev]);
      closeModal();
    } catch (e: unknown) {
      setFError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setFSaving(false);
    }
  }

  function closeModal() {
    setShowNew(false); setFTitle(""); setFDesc(""); setFPriority("medium"); setFDue(""); setFError("");
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" dir="rtl">
        <p className="text-lg font-medium text-slate-600">שגיאה בטעינת מעקב המשימות</p>
        <p className="text-sm text-slate-400 mt-1">{loadError}</p>
      </div>
    );
  }

  if (!me) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100">המשימות שלי</h1>
          <div className="flex gap-4 mt-1 text-sm text-slate-500">
            <span>לביצוע: <strong className="text-amber-600">{todoCount}</strong></span>
            <span>בביצוע: <strong className="text-blue-600">{inProgressCount}</strong></span>
            <span>הושלמו: <strong className="text-green-600">{doneCount}</strong></span>
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12">אין משימות פתוחות</p>
        )}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onCycle={() => cycleStatus(task)} />
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800 dark:text-zinc-100">משימה חדשה</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">כותרת</label>
                <input type="text" placeholder="כותרת המשימה" value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoFocus required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">תיאור</label>
                <textarea placeholder="תיאור (אופציונלי)" value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">עדיפות</label>
                  <select value={fPriority} onChange={(e) => setFPriority(e.target.value as Priority)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">תאריך יעד</label>
                  <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              {fError && <p className="text-sm text-red-500">{fError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                  ביטול
                </button>
                <button type="submit" disabled={fSaving}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {fSaving ? "שומר..." : "צור משימה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
