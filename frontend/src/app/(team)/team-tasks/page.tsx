"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, CalendarDays, AlertCircle, Paperclip, Loader2, Search } from "lucide-react";
import TaskDetailModal, { type Task as DetailTask } from "@/components/TaskDetailModal";
import { useUndo, UndoToast } from "@/components/UndoToast";
import { Celebration } from "@/components/Celebration";
import { StatusPicker, STATUS_LABEL, STATUS_STYLE } from "@/components/StatusPicker";
import type { Status } from "@/components/StatusPicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Priority = "low" | "medium" | "high" | "none";
type Filter = "all" | "today" | "week" | "month" | "done";

type Task = { id: string; title: string; description: string | null; status: Status; priority: Priority; assigned_to_id: string; assigned_to_name: string; due_date: string | null; project_id: string | null; project_name: string | null; created_by_name: string | null; created_at: string };
type Project = { id: string; name: string };
type User = { id: string; name: string; email: string; role: string };
const PRIORITY_LABEL: Record<Priority, string> = { none: "", low: "נמוכה", medium: "בינונית", high: "גבוהה" };
const PRIORITY_BORDER: Record<Priority, string> = {
  none: "border-r-slate-200", low: "border-r-slate-200", medium: "border-r-amber-400", high: "border-r-red-500",
};

function apiHeaders(email: string) {
  return { "Content-Type": "application/json", "x-dev-email": email };
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isToday(s: string) { return startOfDay(new Date(s)).getTime() === startOfDay(new Date()).getTime(); }
function isThisWeek(s: string) { const d = startOfDay(new Date(s)), t = startOfDay(new Date()), e = new Date(t); e.setDate(t.getDate() + 7); return d >= t && d < e; }
function isThisMonth(s: string) { const d = new Date(s), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }
function isOverdue(s: string) { return startOfDay(new Date(s)) < startOfDay(new Date()); }
function formatDate(s: string) { return isToday(s) ? "היום" : new Date(s).toLocaleDateString("he-IL", { day: "numeric", month: "short" }); }

function filterTask(task: Task, filter: Filter) {
  if (filter === "all") return task.status !== "done";
  if (filter === "done") return task.status === "done";
  if (task.status === "done") return false;
  if (!task.due_date) return false;
  if (filter === "today") return isToday(task.due_date);
  if (filter === "week") return isThisWeek(task.due_date);
  if (filter === "month") return isThisMonth(task.due_date);
  return true;
}

export default function MyTasksPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("none");
  const [fDue, setFDue] = useState("");
  const [fFile, setFFile] = useState<File | null>(null);
  const [fProjectId, setFProjectId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState("");
  const [search, setSearch] = useState("");
  const [celebrationTask, setCelebrationTask] = useState<Task | null>(null);
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null);
  const fFileRef = useRef<HTMLInputElement>(null);
  const { pending: undoPending, schedule: scheduleUndo, undo } = useUndo();

  const load = useCallback(async (u: User) => {
    const res = await fetch(`${API}/team/tasks`, { headers: apiHeaders(u.email) });
    if (res.ok) {
      const all = await res.json() as Task[];
      setTasks(all.filter((t) => t.assigned_to_id === u.id));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) return;
    const u: User = JSON.parse(saved);
    setUser(u);
    load(u);
    fetch(`${API}/team/projects`, { headers: apiHeaders(u.email) })
      .then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {});
  }, [load]);

  function changeStatus(task: Task, newStatus: Status) {
    if (!user || newStatus === task.status) return;
    const prev = task.status;
    setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, status: newStatus } : t));
    if (newStatus === "done") setCelebrationTask(task);
    scheduleUndo(
      `סטטוס שונה ל״${STATUS_LABEL[newStatus]}״`,
      () => fetch(`${API}/team/tasks/${task.id}`, { method: "PATCH", headers: apiHeaders(user.email), body: JSON.stringify({ status: newStatus }) }),
      () => { setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, status: prev } : t)); setCelebrationTask(null); },
    );
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !fTitle.trim()) return;
    setFSaving(true); setFError("");
    try {
      const res = await fetch(`${API}/team/tasks`, {
        method: "POST", headers: apiHeaders(user.email),
        body: JSON.stringify({ title: fTitle.trim(), description: fDesc.trim() || null, priority: fPriority, assigned_to_id: user.id, due_date: fDue ? new Date(fDue).toISOString() : null, project_id: fProjectId || null }),
      });
      if (!res.ok) throw new Error();
      const task = await res.json();
      if (fFile) {
        const form = new FormData();
        form.append("file", fFile);
        await fetch(`${API}/team/tasks/${task.id}/files`, { method: "POST", headers: { "x-dev-email": user.email }, body: form });
      }
      setTasks((prev) => [task, ...prev]);
      closeModal();
    } catch { setFError("שגיאה ביצירת המשימה"); } finally { setFSaving(false); }
  }

  function closeModal() { setShowNew(false); setFTitle(""); setFDesc(""); setFPriority("none"); setFDue(""); setFFile(null); setFProjectId(""); setFError(""); }

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const q = search.trim().toLowerCase();
  const filtered = tasks.filter((t) => filterTask(t, filter) && (
    !q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
  ));
  const overdueCount = activeTasks.filter((t) => t.due_date && isOverdue(t.due_date)).length;

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "הכל", count: activeTasks.length },
    { key: "today", label: "היום", count: activeTasks.filter((t) => t.due_date && isToday(t.due_date)).length },
    { key: "week", label: "השבוע", count: activeTasks.filter((t) => t.due_date && isThisWeek(t.due_date)).length },
    { key: "month", label: "החודש", count: activeTasks.filter((t) => t.due_date && isThisMonth(t.due_date)).length },
    { key: "done", label: "הושלמו", count: doneTasks.length },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">המשימות שלי</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500">{activeTasks.length} משימות פתוחות</span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />{overdueCount} באיחור
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 h-9 px-3 md:px-4 rounded-xl text-white text-sm font-semibold transition-colors shrink-0"
          style={{ background: "#33004e" }}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">משימה חדשה</span>
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
              filter === f.key ? "text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            style={filter === f.key ? { background: "#33004e" } : {}}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${filter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש משימות..."
          className="w-full rounded-xl border border-slate-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12">
            {q ? "לא נמצאו משימות תואמות" : filter === "all" ? "אין משימות פתוחות" : "אין משימות בתקופה זו"}
          </p>
        )}
        {filtered.map((task) => {
          const overdue = task.due_date && task.status !== "done" && isOverdue(task.due_date);
          const statusDot: Record<Status, string> = { todo: "#f59e0b", in_progress: "#3b82f6", done: "#22c55e" };
          return (
            <div key={task.id} onClick={() => setSelectedTask(task)}
              className={`rounded-2xl border-r-4 bg-white cursor-pointer active:scale-[0.99] transition-all ${PRIORITY_BORDER[task.priority]} ${task.status === "done" ? "opacity-55" : ""}`}
              style={{ border: "1px solid #f1f5f9", borderRightWidth: 4, boxShadow: "0 1px 8px 0 rgba(0,0,0,0.06)" }}>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {task.project_name && (
                      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                        {task.project_name}
                      </span>
                    )}
                    <p className={`font-semibold text-base leading-snug ${task.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
                    )}
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setPickerTaskId(pickerTaskId === task.id ? null : task.id); }}
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-opacity active:opacity-60"
                      style={{ background: task.status === "done" ? "#f0fdf4" : task.status === "in_progress" ? "#eff6ff" : "#fffbeb" }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusDot[task.status] }} />
                    </button>
                    {pickerTaskId === task.id && (
                      <StatusPicker current={task.status}
                        onSelect={(s) => { setPickerTaskId(null); changeStatus(task, s); }}
                        onClose={() => setPickerTaskId(null)} />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #f8fafc" }}>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  {task.due_date && (
                    <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-500" : "text-slate-400"}`}>
                      <CalendarDays className="w-3 h-3" />{formatDate(task.due_date)}{overdue && " · באיחור"}
                    </span>
                  )}
                  {task.priority !== "none" && (
                    <span className={`text-xs font-medium ${task.priority === "high" ? "text-red-500" : task.priority === "medium" ? "text-amber-600" : "text-slate-400"}`}>
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && user && (
        <TaskDetailModal task={selectedTask as DetailTask} userEmail={user.email}
          isAdmin={user.role === "admin"}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(id, status) => {
            setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
            setSelectedTask((prev) => prev && prev.id === id ? { ...prev, status } : prev);
          }}
          onTransfer={(id, newId, newName) => {
            setTasks((prev) => prev.map((t) => t.id === id ? { ...t, assigned_to_id: newId, assigned_to_name: newName } : t));
            setSelectedTask((prev) => prev && prev.id === id ? { ...prev, assigned_to_id: newId, assigned_to_name: newName } : prev);
          }} />
      )}

      <Celebration show={!!celebrationTask} taskTitle={celebrationTask?.title} onHide={() => setCelebrationTask(null)} />
      <UndoToast pending={undoPending} onUndo={undo} />

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">משימה חדשה</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">כותרת</label>
                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="כותרת המשימה" autoFocus required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="תיאור (אופציונלי)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none" />
              </div>
              {projects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">פרויקט</label>
                  <select value={fProjectId} onChange={e => setFProjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="">ללא פרויקט</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">עדיפות</label>
                  <select value={fPriority} onChange={(e) => setFPriority(e.target.value as Priority)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="none">ללא</option><option value="low">נמוכה</option><option value="medium">בינונית</option><option value="high">גבוהה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תאריך יעד</label>
                  <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">קובץ מצורף</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fFileRef.current?.click()}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                    <Paperclip className="w-3.5 h-3.5" />{fFile ? fFile.name : "בחר קובץ..."}
                  </button>
                  {fFile && <button type="button" onClick={() => { setFFile(null); if (fFileRef.current) fFileRef.current.value = ""; }} className="text-slate-300 hover:text-red-400"><X className="w-4 h-4" /></button>}
                  <input ref={fFileRef} type="file" accept=".pdf,.docx,.txt,.doc" className="hidden" onChange={(e) => setFFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              {fError && <p className="text-sm text-red-500">{fError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">ביטול</button>
                <button type="submit" disabled={fSaving}
                  className="flex-1 h-10 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: "#33004e" }}>
                  {fSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "צור משימה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
