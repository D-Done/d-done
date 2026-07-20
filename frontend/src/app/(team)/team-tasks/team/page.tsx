"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, CalendarDays, AlertCircle, Paperclip, Loader2, Search, Users } from "lucide-react";
import TaskDetailModal, { type Task as DetailTask } from "@/components/TaskDetailModal";
import { useUndo, UndoToast } from "@/components/UndoToast";
import { Celebration } from "@/components/Celebration";
import { StatusPicker, STATUS_LABEL, STATUS_STYLE } from "@/components/StatusPicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

import type { Status } from "@/components/StatusPicker";
type Priority = "low" | "medium" | "high" | "none";
type Filter = "all" | "today" | "week" | "month" | "done";

type Task = {
  id: string; title: string; description: string | null;
  status: Status; priority: Priority;
  assigned_to_id: string; assigned_to_name: string;
  due_date: string | null; created_at: string;
  co_assignee_ids?: string | null;
  project_id?: string | null; project_name?: string | null;
};
type Member = { id: string; name: string; role: string };
type User = { id: string; name: string; email: string; role: string };
type GroupMember = { user_id: string; user_name: string };
type Group = { id: string; name: string; members: GroupMember[] };

const PRIORITY_BORDER: Record<Priority, string> = {
  none: "border-r-slate-200", low: "border-r-slate-200", medium: "border-r-amber-400", high: "border-r-red-500",
};
const PRIORITY_LABEL: Record<Priority, string> = { none: "", low: "נמוכה", medium: "בינונית", high: "גבוהה" };

function hdrs(email: string) {
  return { "Content-Type": "application/json", "x-dev-email": email };
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const today = startOfDay(new Date());
  return startOfDay(d).getTime() === today.getTime();
}

function isThisWeek(dateStr: string) {
  const d = startOfDay(new Date(dateStr));
  const today = startOfDay(new Date());
  const end = new Date(today); end.setDate(today.getDate() + 7);
  return d >= today && d < end;
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isOverdue(dateStr: string) {
  return startOfDay(new Date(dateStr)) < startOfDay(new Date());
}

function filterTask(task: Task, filter: Filter) {
  if (filter === "all") return true;
  if (!task.due_date) return false;
  if (filter === "today") return isToday(task.due_date);
  if (filter === "week") return isThisWeek(task.due_date);
  if (filter === "month") return isThisMonth(task.due_date);
  return true;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(dateStr)) return "היום";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

export default function TeamOverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [fAssignee, setFAssignee] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("none");
  const [fProjectId, setFProjectId] = useState("");
  const [fProjects, setFProjects] = useState<{ id: string; name: string }[]>([]);
  const [fDue, setFDue] = useState("");
  const [fFile, setFFile] = useState<File | null>(null);
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState("");
  const [fIsGroup, setFIsGroup] = useState(false);
  const [fGroupId, setFGroupId] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [celebrationTask, setCelebrationTask] = useState<Task | null>(null);
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const fFileRef = useRef<HTMLInputElement>(null);
  const { pending: undoPending, schedule: scheduleUndo, undo } = useUndo();

  const load = useCallback(async (u: User) => {
    const [tr, mr] = await Promise.all([
      fetch(`${API}/team/tasks`, { headers: hdrs(u.email) }),
      fetch(`${API}/team/members`, { headers: hdrs(u.email) }),
    ]);
    if (tr.ok) setTasks(await tr.json());
    if (mr.ok) { const m = await mr.json(); setMembers(m); setFAssignee(u.id); }
    const gr = await fetch(`${API}/team/groups`, { headers: hdrs(u.email) });
    if (gr.ok) setGroups(await gr.json());
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/"); return; }
    const u: User = JSON.parse(saved);
    if (u.role !== "admin") { router.replace("/tasks"); return; }
    setUser(u);
    load(u);
  }, [load, router]);

  function changeStatus(task: Task, newStatus: Status) {
    if (!user || newStatus === task.status) return;
    const prev = task.status;
    setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, status: newStatus } : t));
    if (newStatus === "done") setCelebrationTask(task);
    scheduleUndo(
      `סטטוס שונה ל״${STATUS_LABEL[newStatus]}״`,
      () => fetch(`${API}/team/tasks/${task.id}`, { method: "PATCH", headers: hdrs(user.email), body: JSON.stringify({ status: newStatus }) }),
      () => { setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, status: prev } : t)); setCelebrationTask(null); },
    );
  }

  function deleteTask(id: string) {
    if (!user) return;
    const snapshot = tasks;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    scheduleUndo(
      `המשימה ״${task.title}״ נמחקה`,
      () => fetch(`${API}/team/tasks/${id}`, { method: "DELETE", headers: hdrs(user.email) }),
      () => setTasks(snapshot),
    );
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !fTitle.trim()) return;
    if (fIsGroup && !fGroupId) return;
    if (!fIsGroup && !fAssignee) return;
    setFSaving(true); setFError("");
    try {
      const assignees = fIsGroup
        ? (groups.find(g => g.id === fGroupId)?.members.map(m => m.user_id) ?? [])
        : [fAssignee];
      if (assignees.length === 0) { setFError("הקבוצה ריקה"); setFSaving(false); return; }
      const groupTaskId = fIsGroup ? crypto.randomUUID() : null;
      const newTasks: Task[] = [];
      for (const assigneeId of assignees) {
        const res = await fetch(`${API}/team/tasks`, {
          method: "POST", headers: hdrs(user.email),
          body: JSON.stringify({ title: fTitle.trim(), description: fDesc.trim() || null, priority: fPriority, assigned_to_id: assigneeId, due_date: fDue ? new Date(fDue).toISOString() : null, project_id: (!fIsGroup && fProjectId) ? fProjectId : null, group_task_id: groupTaskId }),
        });
        if (!res.ok) throw new Error();
        const task = await res.json();
        if (fFile && !fIsGroup) {
          const form = new FormData();
          form.append("file", fFile);
          await fetch(`${API}/team/tasks/${task.id}/files`, { method: "POST", headers: { "x-dev-email": user.email }, body: form });
        }
        newTasks.push(task);
      }
      setTasks((prev) => [...newTasks, ...prev]);
      closeModal();
    } catch { setFError("שגיאה"); } finally { setFSaving(false); }
  }

  async function loadProjects() {
    if (!user) return;
    const res = await fetch(`${API}/team/projects`, { headers: hdrs(user.email) });
    const data = res.ok ? await res.json() : [];
    setFProjects(data);
  }

  function openFor(memberId: string) {
    setFAssignee(memberId); setFTitle(""); setFDesc(""); setFPriority("none"); setFDue(""); setFFile(null); setFError(""); setFIsGroup(false); setFGroupId(""); setFProjectId(""); setShowNew(true);
    loadProjects();
  }
  function closeModal() {
    setShowNew(false); setFTitle(""); setFDesc(""); setFPriority("none"); setFDue(""); setFFile(null); setFError(""); setFIsGroup(false); setFGroupId(""); setFProjectId("");
    if (user) setFAssignee(user.id);
  }

  if (!user) return null;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const filtered = filter === "done"
    ? doneTasks
    : activeTasks.filter((t) => filterTask(t, filter));
  const q = search.trim().toLowerCase();
  function taskBelongsToMember(t: Task, memberId: string) {
    return t.assigned_to_id === memberId ||
      (t.co_assignee_ids ? t.co_assignee_ids.split(",").includes(memberId) : false);
  }
  const byMember = (list: Task[]) =>
    selectedMemberId ? list.filter((t) => taskBelongsToMember(t, selectedMemberId)) : list;
  const searchResults = q
    ? byMember(tasks.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.assigned_to_name.toLowerCase().includes(q)
      ))
    : null;
  const visibleMembers = selectedMemberId ? members.filter((m) => m.id === selectedMemberId) : members;
  const grouped = visibleMembers.map((m) => ({ member: m, tasks: filtered.filter((t) => taskBelongsToMember(t, m.id)) }));

  const todayCount = activeTasks.filter((t) => t.due_date && isToday(t.due_date)).length;
  const weekCount = activeTasks.filter((t) => t.due_date && isThisWeek(t.due_date)).length;
  const monthCount = activeTasks.filter((t) => t.due_date && isThisMonth(t.due_date)).length;
  const overdueCount = activeTasks.filter((t) => t.due_date && isOverdue(t.due_date)).length;

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "הכל", count: activeTasks.length },
    { key: "today", label: "היום", count: todayCount },
    { key: "week", label: "השבוע", count: weekCount },
    { key: "month", label: "החודש", count: monthCount },
    { key: "done", label: "הושלמו", count: doneTasks.length },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">כל הצוות</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500">{activeTasks.length} משימות פתוחות</span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />{overdueCount} באיחור
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { setFAssignee(""); setFTitle(""); setFDesc(""); setFPriority("none"); setFDue(""); setFFile(null); setFError(""); setFProjectId(""); setFIsGroup(false); setFGroupId(""); setShowNew(true); loadProjects(); }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-sm font-semibold transition-colors"
          style={{ background: "#33004e" }}>
          <Plus className="w-4 h-4" />משימה חדשה
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
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

      {/* Member filter chips */}
      {members.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {members.map((m) => {
            const isSelected = selectedMemberId === m.id;
            const count = activeTasks.filter((t) => taskBelongsToMember(t, m.id)).length;
            return (
              <button key={m.id} onClick={() => setSelectedMemberId(isSelected ? null : m.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
                style={isSelected
                  ? { background: "#33004e", color: "#fff", borderColor: "#33004e" }
                  : { background: "#fff", color: "#33004e", borderColor: "#e8d8f4" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={isSelected
                    ? { background: "rgba(255,255,255,0.18)", color: "#fff" }
                    : { background: "#ede0f8", color: "#5c2d82" }}>
                  {m.name.charAt(0)}
                </span>
                {m.name}
                <span className="text-xs font-semibold opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mb-6">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי כותרת, תיאור או עו״ד..."
          className="w-full rounded-xl border border-slate-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {searchResults ? (
        <div className="space-y-2">
          {searchResults.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">לא נמצאו משימות תואמות</p>
          ) : (
            searchResults.map((task) => {
              const overdue = task.due_date && task.status !== "done" && isOverdue(task.due_date);
              return (
                <div key={task.id} onClick={() => setSelectedTask(task)}
                  className={`rounded-xl border-r-4 border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${PRIORITY_BORDER[task.priority]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "#ede0f8", color: "#5c2d82" }}>
                          {task.assigned_to_name}
                        </span>
                        {task.project_name && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                            {task.project_name}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-800 text-sm">{task.title}</p>
                      {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        {task.due_date && (
                          <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-500" : "text-slate-400"}`}>
                            <CalendarDays className="w-3 h-3" />{formatDate(task.due_date)}{overdue && " · באיחור"}
                          </span>
                        )}
                        {task.priority !== "none" && (
                          <span className={`text-xs ${task.priority === "high" ? "text-red-500 font-medium" : task.priority === "medium" ? "text-amber-600" : "text-slate-400"}`}>
                            {PRIORITY_LABEL[task.priority]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setPickerTaskId(pickerTaskId === task.id ? null : task.id); }}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[task.status]}`}>
                          {STATUS_LABEL[task.status]}
                        </button>
                        {pickerTaskId === task.id && (
                          <StatusPicker current={task.status}
                            onSelect={(s) => { setPickerTaskId(null); changeStatus(task, s); }}
                            onClose={() => setPickerTaskId(null)} />
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                        className="text-slate-200 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (

      <div className="space-y-8">
        {grouped.map(({ member, tasks: mt }) => (
          <div key={member.id}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                {member.name.charAt(0)}
              </div>
              <span className="font-semibold text-slate-700 text-sm">{member.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{mt.length}</span>
              <div className="flex-1 h-px bg-slate-100" />
              <button onClick={() => openFor(member.id)} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" />הוסף
              </button>
            </div>

            {mt.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                {filter === "all" ? "אין משימות" : "אין משימות בתקופה זו"}
              </p>
            ) : (
              <div className="space-y-2">
                {mt.map((task) => {
                  const overdue = task.due_date && task.status !== "done" && isOverdue(task.due_date);
                  const isShared = !!task.co_assignee_ids;
                  const isCoAssigned = isShared && task.assigned_to_id !== member.id;
                  return (
                    <div key={task.id} onClick={() => setSelectedTask(task)}
                      className={`rounded-xl border-r-4 border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${PRIORITY_BORDER[task.priority]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            {task.project_name && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                                {task.project_name}
                              </span>
                            )}
                            <p className="font-medium text-slate-800 text-sm">{task.title}</p>
                            {isShared && (
                              <span title={isCoAssigned ? `מוקצה ל${task.assigned_to_name}` : "משותף"} className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                                <Users className="w-2.5 h-2.5" />
                                {isCoAssigned ? task.assigned_to_name : "משותף"}
                              </span>
                            )}
                          </div>
                          {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            {task.due_date && (
                              <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-500" : "text-slate-400"}`}>
                                <CalendarDays className="w-3 h-3" />{formatDate(task.due_date)}{overdue && " · באיחור"}
                              </span>
                            )}
                            {task.priority !== "none" && (
                              <span className={`text-xs ${task.priority === "high" ? "text-red-500 font-medium" : task.priority === "medium" ? "text-amber-600" : "text-slate-400"}`}>
                                {PRIORITY_LABEL[task.priority]}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setPickerTaskId(pickerTaskId === task.id ? null : task.id); }}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[task.status]}`}>
                              {STATUS_LABEL[task.status]}
                            </button>
                            {pickerTaskId === task.id && (
                              <StatusPicker current={task.status}
                                onSelect={(s) => { setPickerTaskId(null); changeStatus(task, s); }}
                                onClose={() => setPickerTaskId(null)} />
                            )}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                            className="text-slate-200 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      <Celebration show={!!celebrationTask} taskTitle={celebrationTask?.title} onHide={() => setCelebrationTask(null)} />
      <UndoToast pending={undoPending} onUndo={undo} />

      {selectedTask && user && (
        <TaskDetailModal
          task={selectedTask as DetailTask}
          userEmail={user.email}
          isAdmin={true}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(id, status) => {
            setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
            setSelectedTask((prev) => prev && prev.id === id ? { ...prev, status } : prev);
          }}
          onTransfer={() => {
            if (user) load(user);
            setSelectedTask(null);
          }}
        />
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">משימה חדשה</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createTask} className="space-y-4">
              {/* Group task toggle */}
              {groups.length > 0 && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={fIsGroup} onChange={e => { setFIsGroup(e.target.checked); setFGroupId(""); }}
                    className="rounded w-4 h-4 accent-violet-600" />
                  <span className="text-sm font-medium text-slate-700">משימה קבוצתית</span>
                </label>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {fIsGroup ? "קבוצה" : "עבור מי?"}
                </label>
                {fIsGroup ? (
                  <select value={fGroupId} onChange={e => setFGroupId(e.target.value)} required autoFocus
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                    <option value="" disabled>בחר/י קבוצה</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.members.length} חברים)</option>
                    ))}
                  </select>
                ) : (
                  <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} required autoFocus
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="" disabled>בחר/י עבור מי</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {!fIsGroup && fAssignee && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">פרויקט</label>
                    <select value={fProjectId} onChange={e => setFProjectId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                      style={{ color: fProjectId ? "#7c3aed" : "#94a3b8" }}>
                      <option value="">ללא פרויקט</option>
                      {fProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                {fIsGroup && fGroupId && (() => {
                  const g = groups.find(g => g.id === fGroupId);
                  return g && g.members.length > 0 ? (
                    <p className="text-xs mt-1.5" style={{ color: "#9a6ad7" }}>
                      יוצרת {g.members.length} משימות: {g.members.map(m => m.user_name).join(", ")}
                    </p>
                  ) : g ? <p className="text-xs mt-1.5 text-red-400">הקבוצה ריקה — הוסף חברים בהגדרות</p> : null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">כותרת</label>
                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="כותרת המשימה" required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="תיאור (אופציונלי)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none" />
              </div>
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
              {!fIsGroup && (
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
              )}
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
