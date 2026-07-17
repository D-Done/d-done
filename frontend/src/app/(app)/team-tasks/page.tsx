"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, X } from "lucide-react";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const err = new Error((d as { detail?: string }).detail ?? "שגיאה");
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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

type Member = { id: string; name: string; role: string };
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

export default function TeamTasksPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("medium");
  const [fAssignee, setFAssignee] = useState("");
  const [fDue, setFDue] = useState("");
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState("");

  const load = useCallback(async () => {
    try {
      const [meData, tasksData, membersData] = await Promise.all([
        api<Me>("/team/me"),
        api<Task[]>("/team/tasks"),
        api<Member[]>("/team/members"),
      ]);
      setMe(meData);
      setTasks(tasksData);
      setMembers(membersData);
      setFAssignee(meData.id);
    } catch (e: unknown) {
      const status = (e as Error & { status?: number }).status;
      if (status === 403) setNoAccess(true);
      else setLoadError(e instanceof Error ? e.message : "שגיאה בטעינת הנתונים");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cycleStatus(task: Task) {
    const next = STATUS_NEXT[task.status];
    await api(`/team/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t));
  }

  async function deleteTask(id: string) {
    await api(`/team/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) return;
    setFSaving(true); setFError("");
    try {
      const task = await api<Task>("/team/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: fTitle.trim(),
          description: fDesc.trim() || null,
          priority: fPriority,
          assigned_to_id: fAssignee,
          due_date: fDue ? new Date(fDue).toISOString() : null,
        }),
      });
      setTasks((prev) => [task, ...prev]);
      closeModal();
    } catch (e: unknown) {
      setFError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setFSaving(false); }
  }

  function openModalFor(memberId: string) {
    setFAssignee(memberId); setFTitle(""); setFDesc(""); setFPriority("medium"); setFDue(""); setFError("");
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false); setFTitle(""); setFDesc(""); setFPriority("medium"); setFDue(""); setFError("");
    if (me) setFAssignee(me.id);
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (noAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" dir="rtl">
        <p className="text-lg font-medium text-slate-600">אין לך גישה למעקב המשימות</p>
        <p className="text-sm text-slate-400 mt-1">פנה לראש הצוות להוספה למערכת</p>
      </div>
    );
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

  const isAdmin = me.role === "admin";
  const grouped = isAdmin
    ? members.map((m) => ({ member: m, tasks: tasks.filter((t) => t.assigned_to_id === m.id) }))
    : [{ member: { ...me }, tasks }];

  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100">מעקב משימות</h1>
          <div className="flex gap-4 mt-1 text-sm text-slate-500">
            <span>לביצוע: <strong className="text-amber-600">{todoCount}</strong></span>
            <span>בביצוע: <strong className="text-blue-600">{inProgressCount}</strong></span>
            <span>הושלמו: <strong className="text-green-600">{doneCount}</strong></span>
          </div>
        </div>
        <button
          onClick={() => openModalFor(me.id)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      {/* Tasks */}
      <div className="space-y-6">
        {grouped.map(({ member, tasks: memberTasks }) => (
          <div key={member.id}>
            {isAdmin && (
              <button
                onClick={() => toggleCollapse(member.id)}
                className="flex items-center gap-2 w-full text-right mb-2 group"
              >
                <span className="font-semibold text-sm text-slate-700 dark:text-zinc-200">{member.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500">
                  {memberTasks.length}
                </span>
                <span className="mr-auto text-slate-300 group-hover:text-slate-500">
                  {collapsed.has(member.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </button>
            )}

            {!collapsed.has(member.id) && (
              <div className="space-y-2">
                {memberTasks.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">אין משימות</p>
                )}
                {memberTasks.map((task) => (
                  <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                    onCycle={() => cycleStatus(task)} onDelete={() => deleteTask(task.id)} />
                ))}
                {isAdmin && (
                  <button
                    onClick={() => openModalFor(member.id)}
                    className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 text-xs text-slate-400 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    הוסף משימה ל{member.name}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New task modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800 dark:text-zinc-100">משימה חדשה</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">כותרת</label>
                <input
                  type="text"
                  placeholder="כותרת המשימה"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoFocus required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  תיאור <span className="text-slate-400 font-normal">(אופציונלי)</span>
                </label>
                <textarea rows={2} placeholder="פרטים נוספים..." value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">עבור</label>
                  <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">עדיפות</label>
                  <select value={fPriority} onChange={(e) => setFPriority(e.target.value as Priority)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">תאריך יעד</label>
                  <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              {fError && <p className="text-sm text-destructive text-center bg-destructive/10 rounded-lg py-2">{fError}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={fSaving || !fTitle.trim()}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                  {fSaving ? "שומר..." : "צור משימה"}
                </button>
                <button type="button" onClick={closeModal}
                  className="h-10 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, isAdmin, onCycle, onDelete }: {
  task: Task; isAdmin: boolean; onCycle: () => void; onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700/60 px-4 py-3 flex items-start gap-3 hover:border-primary/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm text-slate-800 dark:text-zinc-100 ${task.status === "done" ? "line-through text-slate-400" : ""}`}>
          {task.title}
        </p>
        {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button onClick={onCycle}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_STYLE[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </button>
          <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
          {task.due_date && <span className="text-xs text-slate-400">יעד: {new Date(task.due_date).toLocaleDateString("he-IL")}</span>}
          {task.created_by_name && <span className="text-xs text-slate-400">נוצר ע"י {task.created_by_name}</span>}
        </div>
      </div>
      {isAdmin && (
        <div className="shrink-0">
          {confirm ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="h-6 px-2 rounded text-xs font-semibold bg-destructive text-white hover:opacity-90">מחק</button>
              <button onClick={() => setConfirm(false)} className="h-6 px-2 rounded text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800">ביטול</button>
            </div>
          ) : (
            <button onClick={() => setConfirm(true)}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
