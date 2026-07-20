"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, type PieLabelRenderProps } from "recharts";
import { CheckCircle2, Clock, AlertCircle, Users, CalendarDays, X, FolderOpen } from "lucide-react";
import TaskDetailModal, { type Task as DetailTask } from "@/components/TaskDetailModal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Status = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high" | "none";
type FilterKey = "all" | "active" | "done" | "overdue";

type Task = {
  id: string; title: string; description: string | null; status: Status; priority: Priority;
  assigned_to_id: string; assigned_to_name: string;
  due_date: string | null; created_at: string; created_by_name: string | null;
  project_id?: string | null; project_name?: string | null;
  group_task_id?: string | null;
};

type Member = { id: string; name: string; role: string };
type Project = { id: string; name: string };
type User = { id: string; name: string; email: string; role: string };

type GroupEntry = { type: "group"; groupId: string; tasks: Task[] };
type SoloEntry  = { type: "solo";  task: Task };
type DisplayEntry = GroupEntry | SoloEntry;

const STATUS_HE: Record<Status, string> = { todo: "לביצוע", in_progress: "בביצוע", done: "הושלם" };
const STATUS_COLORS: Record<Status, string> = { todo: "#f59e0b", in_progress: "#6366f1", done: "#22c55e" };
const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-amber-50 text-amber-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  done: "bg-green-50 text-green-700",
};

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isOverdue(s: string) { return startOfDay(new Date(s)) < startOfDay(new Date()); }
function formatDate(s: string) {
  const d = new Date(s);
  if (startOfDay(d).getTime() === startOfDay(new Date()).getTime()) return "היום";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function groupRank(tasks: Task[]) {
  if (tasks.some(t => t.status !== "done" && t.due_date && isOverdue(t.due_date))) return 0;
  if (tasks.some(t => t.status === "in_progress")) return 1;
  if (tasks.some(t => t.status === "todo")) return 2;
  return 3;
}

function taskRank(t: Task) {
  if (t.status !== "done" && t.due_date && isOverdue(t.due_date)) return 0;
  if (t.status === "in_progress") return 1;
  if (t.status === "todo") return 2;
  return 3;
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelRenderProps) {
  const pct = percent ?? 0;
  if (pct < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const ma = midAngle ?? 0;
  const r = ((innerRadius as number) ?? 0) + (((outerRadius as number) ?? 0) - ((innerRadius as number) ?? 0)) * 0.55;
  const x = (cx as number) + r * Math.cos(-ma * RADIAN);
  const y = (cy as number) + r * Math.sin(-ma * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(pct * 100).toFixed(0)}%`}
    </text>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const load = useCallback(async (u: User) => {
    const [tr, mr, pr] = await Promise.all([
      fetch(`${API}/team/tasks`, { headers: { "x-dev-email": u.email } }),
      fetch(`${API}/team/members`, { headers: { "x-dev-email": u.email } }),
      fetch(`${API}/team/projects`, { headers: { "x-dev-email": u.email } }),
    ]);
    if (tr.ok) setTasks(await tr.json());
    if (mr.ok) setMembers(await mr.json());
    if (pr.ok) setProjects(await pr.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/"); return; }
    const u: User = JSON.parse(saved);
    if (u.role !== "admin") { router.replace("/tasks"); return; }
    setUser(u);
    load(u);
  }, [load, router]);

  if (!user || loading) return null;

  const projectTasks = selectedProjectId ? tasks.filter(t => t.project_id === selectedProjectId) : tasks;

  // Build group map: groupId → tasks[]
  const groupMap = new Map<string, Task[]>();
  for (const t of projectTasks) {
    if (t.group_task_id) {
      const arr = groupMap.get(t.group_task_id) ?? [];
      arr.push(t);
      groupMap.set(t.group_task_id, arr);
    }
  }

  // Deduplicated list: one entry per group, full entry for individuals
  function deduplicateForCount(list: Task[]) {
    const seen = new Set<string>();
    return list.filter(t => {
      if (!t.group_task_id) return true;
      if (seen.has(t.group_task_id)) return false;
      seen.add(t.group_task_id);
      return true;
    });
  }

  // For a group task, its "effective status" for counting purposes
  function groupEffectiveStatus(gid: string): Status {
    const members = groupMap.get(gid) ?? [];
    if (members.every(t => t.status === "done")) return "done";
    if (members.some(t => t.status === "in_progress")) return "in_progress";
    return "todo";
  }

  function effectiveStatus(t: Task): Status {
    return t.group_task_id ? groupEffectiveStatus(t.group_task_id) : t.status;
  }

  function effectiveOverdue(t: Task): boolean {
    if (t.group_task_id) {
      const members = groupMap.get(t.group_task_id) ?? [];
      return members.some(m => m.status !== "done" && m.due_date && isOverdue(m.due_date));
    }
    return t.status !== "done" && !!t.due_date && isOverdue(t.due_date);
  }

  const deduped = deduplicateForCount(projectTasks);
  const active = deduped.filter(t => effectiveStatus(t) !== "done");
  const done = deduped.filter(t => effectiveStatus(t) === "done");
  const overdue = deduped.filter(t => effectiveOverdue(t));

  // Build sorted+deduplicated display entries for the filtered list
  function buildDisplayEntries(rawList: Task[]): DisplayEntry[] {
    const seen = new Set<string>();
    const entries: DisplayEntry[] = [];
    for (const t of rawList) {
      if (t.group_task_id) {
        if (seen.has(t.group_task_id)) continue;
        seen.add(t.group_task_id);
        entries.push({ type: "group", groupId: t.group_task_id, tasks: groupMap.get(t.group_task_id) ?? [t] });
      } else {
        entries.push({ type: "solo", task: t });
      }
    }
    return entries;
  }

  function sortedFilter(list: Task[]): DisplayEntry[] {
    const sorted = [...list].sort((a, b) => {
      const ra = a.group_task_id ? groupRank(groupMap.get(a.group_task_id) ?? [a]) : taskRank(a);
      const rb = b.group_task_id ? groupRank(groupMap.get(b.group_task_id) ?? [b]) : taskRank(b);
      return ra - rb;
    });
    return buildDisplayEntries(sorted);
  }

  const filterMap: Record<FilterKey, Task[]> = {
    all:    projectTasks,
    active: projectTasks.filter(t => effectiveStatus(t) !== "done"),
    done:   projectTasks.filter(t => effectiveStatus(t) === "done"),
    overdue: projectTasks.filter(t => effectiveOverdue(t)),
  };
  const displayEntries = activeFilter ? sortedFilter(filterMap[activeFilter]) : [];

  const statusData = (["todo", "in_progress", "done"] as Status[])
    .map(s => ({ name: STATUS_HE[s], value: deduped.filter(t => effectiveStatus(t) === s).length, color: STATUS_COLORS[s] }))
    .filter(d => d.value > 0);

  const summaryCards: { label: string; value: number; icon: React.ElementType; color: string; bg: string; filterKey: FilterKey }[] = [
    { label: "סה״כ משימות", value: deduped.length,  icon: Users,        color: "#33004e", bg: "#f3eeff", filterKey: "all"     },
    { label: "פתוחות",      value: active.length,   icon: Clock,        color: "#6366f1", bg: "#eef2ff", filterKey: "active"  },
    { label: "הושלמו",      value: done.length,     icon: CheckCircle2, color: "#22c55e", bg: "#f0fdf4", filterKey: "done"    },
    { label: "באיחור",      value: overdue.length,  icon: AlertCircle,  color: "#ef4444", bg: "#fef2f2", filterKey: "overdue" },
  ];

  const activeCard = summaryCards.find(c => c.filterKey === activeFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#33004e" }}>סטטיסטיקות</h1>
          <p className="text-sm mt-1" style={{ color: "#9a6ad7" }}>סקירת עומס וסטטוס הצוות</p>
        </div>
        {projects.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <FolderOpen className="w-4 h-4 shrink-0" style={{ color: "#9a6ad7" }} />
            <select value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setActiveFilter(e.target.value ? "all" : null); }}
              className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white"
              style={{ borderColor: "#e8d8f4", color: selectedProjectId ? "#7c3aed" : "#94a3b8", minWidth: 140 }}>
              <option value="">כל הפרויקטים</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedProjectId && (
              <button onClick={() => { setSelectedProjectId(""); setActiveFilter(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map(({ label, value, icon: Icon, color, bg, filterKey }) => {
          const isActive = activeFilter === filterKey;
          return (
            <button key={label} onClick={() => setActiveFilter(isActive ? null : filterKey)}
              className="rounded-2xl p-4 flex flex-col gap-2 text-right transition-all hover:brightness-95 active:scale-[0.98]"
              style={{ background: bg, boxShadow: isActive ? `0 0 0 2.5px ${color}` : undefined }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-3xl font-bold" style={{ color }}>{value}</span>
            </button>
          );
        })}
      </div>

      {/* Filtered task list */}
      {activeFilter && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: activeCard?.color ?? "#e8d8f4", borderWidth: 1.5 }}>
          <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: "#f3eeff", background: "#faf7ff" }}>
            <h2 className="font-semibold text-sm" style={{ color: "#33004e" }}>
              {activeCard?.label} <span className="font-normal text-slate-400">({displayEntries.length})</span>
            </h2>
            <button onClick={() => setActiveFilter(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {displayEntries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">אין משימות</p>
          ) : (
            <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "#f8f5fc" }}>
              {displayEntries.map((entry) => {
                if (entry.type === "solo") {
                  const task = entry.task;
                  const late = task.due_date && task.status !== "done" && isOverdue(task.due_date);
                  return (
                    <div key={task.id} onClick={() => setSelectedTask(task)}
                      className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: "#33004e" }}>{task.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#ede0f8", color: "#5c2d82" }}>
                            {task.assigned_to_name}
                          </span>
                          {task.project_name && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                              {task.project_name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={`flex items-center gap-1 text-xs ${late ? "text-red-500 font-medium" : "text-slate-400"}`}>
                              <CalendarDays className="w-3 h-3" />
                              {formatDate(task.due_date)}{late && " · באיחור"}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLE[task.status]}`}>
                        {STATUS_HE[task.status]}
                      </span>
                    </div>
                  );
                }

                // Group task entry
                const { tasks: gt } = entry;
                const rep = gt[0];
                const doneCount = gt.filter(t => t.status === "done").length;
                const late = gt.some(t => t.status !== "done" && t.due_date && isOverdue(t.due_date));
                return (
                  <div key={entry.groupId} className="px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedTask(rep)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-medium" style={{ color: "#33004e" }}>{rep.title}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 flex items-center gap-1"
                            style={{ background: "#f3eeff", color: "#7c3aed" }}>
                            <Users className="w-3 h-3" />קבוצתי
                          </span>
                        </div>
                        {rep.project_name && (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold mb-1.5" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                            {rep.project_name}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {gt.map(t => {
                            const memberLate = t.status !== "done" && t.due_date && isOverdue(t.due_date);
                            return (
                              <span key={t.id} onClick={e => { e.stopPropagation(); setSelectedTask(t); }}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${STATUS_STYLE[t.status]} ${memberLate ? "ring-1 ring-red-400" : ""}`}
                                title={memberLate ? "באיחור" : ""}>
                                {t.assigned_to_name}
                                <span className="opacity-70">· {STATUS_HE[t.status]}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doneCount === gt.length ? "bg-green-50 text-green-700" : late ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                          {doneCount}/{gt.length} הושלמו
                        </span>
                        {rep.due_date && (
                          <p className={`text-xs mt-1 flex items-center gap-1 justify-end ${late ? "text-red-500" : "text-slate-400"}`}>
                            <CalendarDays className="w-3 h-3" />{formatDate(rep.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Status pie */}
      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: "#e8d8f4" }}>
        <h2 className="font-semibold mb-4" style={{ color: "#33004e" }}>פילוח לפי סטטוס</h2>
        {statusData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">אין משימות</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" outerRadius={110}
                dataKey="value" labelLine={false} label={PieLabel}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} משימות`, ""]} />
              <Legend iconType="circle" iconSize={8}
                formatter={(value) => <span style={{ fontSize: 12, color: "#33004e" }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-member breakdown table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: "#e8d8f4" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "#e8d8f4" }}>
          <h2 className="font-semibold" style={{ color: "#33004e" }}>פירוט לפי עורך דין</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium" style={{ color: "#9a6ad7", background: "#faf7ff" }}>
                <th className="text-right px-6 py-3 font-medium">שם</th>
                <th className="text-center px-4 py-3 font-medium">לביצוע</th>
                <th className="text-center px-4 py-3 font-medium">בביצוע</th>
                <th className="text-center px-4 py-3 font-medium">הושלמו</th>
                <th className="text-center px-4 py-3 font-medium">באיחור</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#f3eeff" }}>
              {members.map((m) => {
                const mt = projectTasks.filter(t => t.assigned_to_id === m.id);
                const todo = mt.filter(t => t.status === "todo").length;
                const inprog = mt.filter(t => t.status === "in_progress").length;
                const doneCount = mt.filter(t => t.status === "done").length;
                const overdueCount = mt.filter(t => t.status !== "done" && t.due_date && isOverdue(t.due_date)).length;
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium" style={{ color: "#33004e" }}>{m.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">{todo}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">{inprog}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">{doneCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {overdueCount > 0
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">{overdueCount}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTask && user && (
        <TaskDetailModal
          task={selectedTask as DetailTask}
          userEmail={user.email}
          isAdmin={user.role === "admin"}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(id, status) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))}
        />
      )}
    </div>
  );
}
