"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, FolderOpen, ChevronDown, ChevronUp, CalendarDays, Loader2 } from "lucide-react";
import TaskDetailModal, { type Task as DetailTask } from "@/components/TaskDetailModal";
import { STATUS_LABEL, STATUS_STYLE } from "@/components/StatusPicker";
import type { Status } from "@/components/StatusPicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Priority = "low" | "medium" | "high" | "none";
type User = { id: string; name: string; email: string; role: string };
type Project = { id: string; name: string; user_id: string; created_at: string };
type Task = {
  id: string; title: string; description: string | null; status: Status; priority: Priority;
  assigned_to_id: string; assigned_to_name: string;
  due_date: string | null; created_at: string; created_by_name: string | null;
  project_id?: string | null; project_name?: string | null;
};

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isOverdue(s: string) { return startOfDay(new Date(s)) < startOfDay(new Date()); }
function formatDate(s: string) {
  const d = new Date(s);
  if (startOfDay(d).getTime() === startOfDay(new Date()).getTime()) return "היום";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function taskRank(t: Task) {
  if (t.status !== "done" && t.due_date && isOverdue(t.due_date)) return 0;
  if (t.status === "in_progress") return 1;
  if (t.status === "todo") return 2;
  return 3;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const loadAll = useCallback(async (u: User) => {
    const [pr, tr] = await Promise.all([
      fetch(`${API}/team/projects`, { headers: { "x-dev-email": u.email } }),
      fetch(`${API}/team/tasks`, { headers: { "x-dev-email": u.email } }),
    ]);
    if (pr.ok) {
      const data = await pr.json();
      setProjects(data.sort((a: Project, b: Project) => a.name.localeCompare(b.name, "he")));
    }
    if (tr.ok) setTasks(await tr.json());
    setTasksLoading(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/"); return; }
    const u: User = JSON.parse(saved);
    setUser(u);
    loadAll(u);
  }, [router, loadAll]);

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API}/team/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": user.email },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error();
      const proj: Project = await res.json();
      setProjects(prev => [...prev, proj].sort((a, b) => a.name.localeCompare(b.name, "he")));
      setNewName("");
    } catch { setError("שגיאה בשמירה"); } finally { setSaving(false); }
  }

  async function deleteProject(id: string) {
    if (!user) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (openProjectId === id) setOpenProjectId(null);
    await fetch(`${API}/team/projects/${id}`, {
      method: "DELETE", headers: { "x-dev-email": user.email },
    }).catch(() => {});
  }

  function toggleProject(id: string) {
    setOpenProjectId(prev => prev === id ? null : id);
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#33004e" }}>הפרויקטים שלי</h1>
        <p className="text-sm mt-1" style={{ color: "#9a6ad7" }}>ניהול רשימת הפרויקטים לשיוך משימות</p>
      </div>

      {/* Add project */}
      <form onSubmit={addProject} className="bg-white rounded-2xl border p-5" style={{ borderColor: "#e8d8f4" }}>
        <p className="text-sm font-semibold mb-3" style={{ color: "#33004e" }}>הוספת פרויקט חדש</p>
        <div className="flex gap-2">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="שם הפרויקט..."
            maxLength={60}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "#d8c0ec", direction: "rtl" }}
          />
          <button type="submit" disabled={saving || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            style={{ background: "#33004e" }}>
            <Plus className="w-4 h-4" />
            הוסף
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </form>

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: "#e8d8f4" }}>
          <FolderOpen className="w-10 h-10 mx-auto mb-3" style={{ color: "#e8d8f4" }} />
          <p className="text-sm font-medium text-slate-500">אין פרויקטים עדיין</p>
          <p className="text-xs text-slate-300 mt-1">הוסף פרויקטים כדי לשייך אליהם משימות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => {
            const projectTasks = tasks
              .filter(t => t.project_id === p.id)
              .sort((a, b) => taskRank(a) - taskRank(b));
            const isOpen = openProjectId === p.id;
            const activeCount = projectTasks.filter(t => t.status !== "done").length;
            const doneCount = projectTasks.filter(t => t.status === "done").length;

            return (
              <div key={p.id} className="bg-white rounded-xl border overflow-hidden transition-shadow"
                style={{ borderColor: isOpen ? "#9a6ad7" : "#e8d8f4", boxShadow: isOpen ? "0 2px 12px 0 rgba(154,106,215,0.12)" : undefined }}>

                {/* Project header */}
                <button onClick={() => toggleProject(p.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-right transition-colors hover:bg-slate-50/60"
                  style={{ background: isOpen ? "#faf5ff" : undefined }}>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isOpen ? "#7c3aed" : "#9a6ad7" }} />
                    <span className="text-sm font-semibold" style={{ color: "#33004e" }}>{p.name}</span>
                    {!tasksLoading && projectTasks.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {activeCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600">{activeCount} פתוחות</span>
                        )}
                        {doneCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-600">{doneCount} הושלמו</span>
                        )}
                      </div>
                    )}
                    {tasksLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                      className="text-slate-300 hover:text-red-400 transition-colors p-1 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </button>

                {/* Task list */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: "#f3eeff" }}>
                    {projectTasks.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">אין משימות בפרויקט זה</p>
                    ) : (
                      <div className="divide-y" style={{ borderColor: "#faf5ff" }}>
                        {projectTasks.map(task => {
                          const late = task.due_date && task.status !== "done" && isOverdue(task.due_date);
                          return (
                            <button key={task.id} onClick={() => setSelectedTask(task)}
                              className="w-full flex items-center justify-between px-5 py-3 gap-3 hover:bg-slate-50 transition-colors text-right">
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium truncate ${task.status === "done" ? "line-through text-slate-400" : ""}`}
                                  style={{ color: task.status === "done" ? undefined : "#33004e" }}>
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#ede0f8", color: "#5c2d82" }}>
                                    {task.assigned_to_name}
                                  </span>
                                  {task.due_date && (
                                    <span className={`flex items-center gap-1 text-xs ${late ? "text-red-500 font-medium" : "text-slate-400"}`}>
                                      <CalendarDays className="w-3 h-3" />
                                      {formatDate(task.due_date)}{late && " · באיחור"}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 ${STATUS_STYLE[task.status]}`}>
                                {STATUS_LABEL[task.status]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedTask && user && (
        <TaskDetailModal
          task={selectedTask as DetailTask}
          userEmail={user.email}
          isAdmin={user.role === "admin"}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(id, status) => {
            setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
            setSelectedTask(prev => prev?.id === id ? { ...prev, status } : prev);
          }}
        />
      )}
    </div>
  );
}
