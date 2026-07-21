"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, CalendarDays, User, Flag, Bot, Loader2, Paperclip, Trash2, Download, MessageSquare, ArrowLeftRight, Pencil, Check, History } from "lucide-react";
import { useUndo, UndoToast } from "./UndoToast";
import { Celebration } from "./Celebration";
import { STATUS_LABEL, STATUS_STYLE } from "./StatusPicker";
import type { Status } from "./StatusPicker";

const API = "/api/v1";

type Priority = "low" | "medium" | "high" | "none";

export type Task = {
  id: string; title: string; description: string | null;
  status: Status; priority: Priority;
  assigned_to_id: string; assigned_to_name: string;
  created_by_name: string | null; due_date: string | null; created_at: string;
  project_id?: string | null; project_name?: string | null;
};

type Project = { id: string; name: string };
type Member = { id: string; name: string; role: string };

type ChatMessage = { role: "user" | "model"; text: string };
type TaskFile = { id: string; filename: string; created_at: string };
type Comment = { id: string; user_name: string; text: string; created_at: string };
type HistoryEntry = {
  id: string; edited_by_name: string; edited_at: string;
  changes: Record<string, { from: string | null; to: string | null }>;
};

const PRIORITY_LABEL: Record<Priority, string> = { none: "", low: "נמוכה", medium: "בינונית", high: "גבוהה" };
const PRIORITY_COLOR: Record<Priority, string> = { none: "text-slate-400", low: "text-slate-500", medium: "text-amber-600", high: "text-red-500" };
const FIELD_LABEL: Record<string, string> = {
  title: "כותרת", description: "תיאור", priority: "עדיפות", due_date: "תאריך יעד", status: "סטטוס",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

interface Props {
  task: Task;
  userEmail: string;
  isAdmin?: boolean;
  onClose: () => void;
  onStatusChange?: (taskId: string, newStatus: Status) => void;
  onTransfer?: (taskId: string, newAssigneeId: string, newAssigneeName: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
}

export default function TaskDetailModal({ task, userEmail, isAdmin, onClose, onStatusChange, onTransfer, onTaskUpdate }: Props) {
  const [tab, setTab] = useState<"comments" | "ai" | "history">("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<Status>(task.status);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const { pending: undoPending, schedule: scheduleUndo, undo } = useUndo();
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(task.project_id ?? "");
  const [showTransfer, setShowTransfer] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [currentAssigneeName, setCurrentAssigneeName] = useState(task.assigned_to_name);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? "");
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editDue, setEditDue] = useState(formatDateInput(task.due_date));
  const [editSaving, setEditSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState(task.title);
  const [localDesc, setLocalDesc] = useState(task.description ?? "");
  const [localPriority, setLocalPriority] = useState<Priority>(task.priority);
  const [localDue, setLocalDue] = useState(task.due_date);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/team/tasks/${task.id}/files`, { headers: { "x-dev-email": userEmail } })
      .then(r => r.ok ? r.json() : []).then(setFiles).catch(() => {});
    fetch(`${API}/team/tasks/${task.id}/comments`, { headers: { "x-dev-email": userEmail } })
      .then(r => r.ok ? r.json() : []).then(setComments).catch(() => {});
    fetch(`${API}/team/projects`, { headers: { "x-dev-email": userEmail } })
      .then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {});
  }, [task.id, userEmail]);

  useEffect(() => {
    setCurrentProjectId(task.project_id ?? "");
  }, [task.project_id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (tab === "history" && history.length === 0 && !historyLoading) {
      setHistoryLoading(true);
      fetch(`${API}/team/tasks/${task.id}/history`, { headers: { "x-dev-email": userEmail } })
        .then(r => r.ok ? r.json() : []).then(setHistory).catch(() => {})
        .finally(() => setHistoryLoading(false));
    }
  }, [tab, task.id, userEmail, history.length, historyLoading]);

  async function saveEdit() {
    if (!editTitle.trim() || editSaving) return;
    setEditSaving(true);
    const updates: Record<string, string | null> = {};
    if (editTitle.trim() !== localTitle) updates.title = editTitle.trim();
    if (editDesc !== localDesc) updates.description = editDesc || null;
    if (editPriority !== localPriority) updates.priority = editPriority;
    const newDue = editDue ? new Date(editDue).toISOString() : null;
    if (newDue !== localDue) updates.due_date = newDue;
    if (Object.keys(updates).length > 0) {
      const res = await fetch(`${API}/team/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-dev-email": userEmail },
        body: JSON.stringify(updates),
      }).catch(() => null);
      if (res?.ok) {
        if (updates.title) setLocalTitle(updates.title);
        if ("description" in updates) setLocalDesc(updates.description ?? "");
        if (updates.priority) setLocalPriority(updates.priority as Priority);
        if ("due_date" in updates) setLocalDue(updates.due_date);
        onTaskUpdate?.(task.id, updates as Partial<Task>);
        // Refresh history
        setHistory([]);
      }
    }
    setEditSaving(false);
    setEditing(false);
  }

  function startEdit() {
    setEditTitle(localTitle);
    setEditDesc(localDesc);
    setEditPriority(localPriority);
    setEditDue(formatDateInput(localDue));
    setEditing(true);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/team/tasks/${task.id}/files`, {
        method: "POST", headers: { "x-dev-email": userEmail }, body: form,
      });
      if (res.ok) { const f = await res.json(); setFiles(prev => [...prev, f]); }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteFile(fileId: string) {
    await fetch(`${API}/team/tasks/${task.id}/files/${fileId}`, { method: "DELETE", headers: { "x-dev-email": userEmail } });
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  async function downloadFile(fileId: string, filename: string) {
    const res = await fetch(`${API}/team/tasks/${task.id}/files/${fileId}/download`, { headers: { "x-dev-email": userEmail } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function openTransfer() {
    if (!members.length) {
      const data = await fetch(`${API}/team/members`, { headers: { "x-dev-email": userEmail } })
        .then(r => r.ok ? r.json() : []).catch(() => []);
      setMembers(data.filter((m: Member) => m.id !== task.assigned_to_id));
    }
    setTransferTo(""); setKeepOriginal(false); setShowTransfer(true);
  }

  async function doTransfer() {
    if (!transferTo || transferring) return;
    setTransferring(true);
    try {
      const res = await fetch(`${API}/team/tasks/${task.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": userEmail },
        body: JSON.stringify({ new_assignee_id: transferTo, keep_original: keepOriginal }),
      });
      if (res.ok) {
        const newName = members.find(m => m.id === transferTo)?.name ?? "";
        setCurrentAssigneeName(keepOriginal ? currentAssigneeName : newName);
        onTransfer?.(task.id, transferTo, newName);
        setShowTransfer(false);
      }
    } finally { setTransferring(false); }
  }

  async function changeProject(projectId: string) {
    setCurrentProjectId(projectId);
    await fetch(`${API}/team/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-dev-email": userEmail },
      body: JSON.stringify({ project_id: projectId || null }),
    }).catch(() => {});
  }

  function changeStatus(newStatus: Status) {
    if (newStatus === currentStatus) return;
    const prev = currentStatus;
    setCurrentStatus(newStatus);
    onStatusChange?.(task.id, newStatus);
    if (newStatus === "done") setShowCelebration(true);
    scheduleUndo(
      `סטטוס שונה ל״${STATUS_LABEL[newStatus]}״`,
      () => fetch(`${API}/team/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-dev-email": userEmail }, body: JSON.stringify({ status: newStatus }) }),
      () => { setCurrentStatus(prev); onStatusChange?.(task.id, prev); setShowCelebration(false); },
    );
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || commentSending) return;
    setCommentSending(true);
    try {
      const res = await fetch(`${API}/team/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": userEmail },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (res.ok) { const c: Comment = await res.json(); setComments(prev => [...prev, c]); setCommentText(""); }
    } finally { setCommentSending(false); }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const userMsg: ChatMessage = { role: "user", text: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setSending(true);
    try {
      const res = await fetch(`${API}/team/tasks/${task.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": userEmail },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "model", text: res.ok ? data.reply : `שגיאה: ${data.detail || "נסה שוב"}` }]);
    } catch { setMessages(prev => [...prev, { role: "model", text: "שגיאה בשליחה" }]); }
    finally { setSending(false); }
  }

  const displayTitle = editing ? editTitle : localTitle;
  const displayDesc = editing ? editDesc : localDesc;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <Celebration show={showCelebration} taskTitle={task.title} onHide={() => setShowCelebration(false)} />
      <UndoToast pending={undoPending} onUndo={undo} />
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92dvh" }}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1">
            {task.project_name && (
              <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5" style={{ background: "#f3eeff", color: "#7c3aed" }}>
                {task.project_name}
              </span>
            )}
            {editing ? (
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                className="w-full text-lg font-bold text-slate-800 border-b-2 border-violet-300 focus:outline-none focus:border-violet-500 bg-transparent mb-1" />
            ) : (
              <h2 className="text-lg font-bold text-slate-800 leading-tight">{displayTitle}</h2>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {showStatusPicker ? (
                <>
                  {(["todo", "in_progress", "done"] as Status[]).map(s => (
                    <button key={s} onClick={() => { setShowStatusPicker(false); changeStatus(s); }}
                      className={`rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-opacity ${s === currentStatus ? "opacity-40 pointer-events-none" : "hover:opacity-80"} ${STATUS_STYLE[s]}`}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                  <button onClick={() => setShowStatusPicker(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button onClick={() => setShowStatusPicker(true)}
                  className={`rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-70 ${STATUS_STYLE[currentStatus]}`}>
                  {STATUS_LABEL[currentStatus]}
                </button>
              )}
              {!editing && localPriority !== "none" && (
                <span className={`text-xs font-medium ${PRIORITY_COLOR[localPriority]}`}>
                  <Flag className="w-3 h-3 inline ml-0.5" />{PRIORITY_LABEL[localPriority]}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mr-2 mt-0.5 shrink-0">
            {editing ? (
              <>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                  style={{ background: "#7c3aed" }}>
                  {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  שמור
                </button>
                <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={startEdit} className="text-slate-400 hover:text-slate-600 transition-colors" title="ערוך משימה">
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Task details */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          {editing ? (
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
              placeholder="תיאור (אופציונלי)"
              className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none mb-2.5" />
          ) : (
            displayDesc && <p className="text-sm text-slate-600 mb-2.5 leading-relaxed">{displayDesc}</p>
          )}

          {editing ? (
            <div className="flex gap-3 mb-2.5 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 block mb-1">עדיפות</label>
                <select value={editPriority} onChange={e => setEditPriority(e.target.value as Priority)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none bg-white">
                  <option value="none">ללא</option>
                  <option value="low">נמוכה</option>
                  <option value="medium">בינונית</option>
                  <option value="high">גבוהה</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">תאריך יעד</label>
                <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none bg-white" />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-2.5">
              {currentAssigneeName && (
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />מוקצה ל{currentAssigneeName}</span>
              )}
              {localDue && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  יעד: {new Date(localDue).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )}
              {task.created_by_name && <span className="text-slate-400">נוצר ע״י {task.created_by_name}</span>}
            </div>
          )}

          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs text-slate-400 shrink-0">פרויקט:</span>
            <select value={currentProjectId} onChange={e => changeProject(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white"
              style={{ color: currentProjectId ? "#7c3aed" : "#94a3b8" }}>
              <option value="">ללא פרויקט</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {isAdmin && !editing && (
            <div className="mb-2.5">
              <button onClick={openTransfer}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "#e2d9f3", color: "#7c3aed", background: "#faf5ff" }}>
                <ArrowLeftRight className="w-3.5 h-3.5" />
                העבר משימה
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {files.map(f => (
              <span key={f.id} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                <Paperclip className="w-3 h-3 text-slate-400" />
                <span className="max-w-[100px] truncate">{f.filename}</span>
                <button onClick={() => downloadFile(f.id, f.filename)} className="text-slate-300 hover:text-blue-500 transition-colors" title="הורד">
                  <Download className="w-3 h-3" />
                </button>
                <button onClick={() => deleteFile(f.id)} className="text-slate-300 hover:text-red-400 transition-colors" title="מחק">
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {uploading ? "מעלה..." : "צרף קובץ"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.doc" className="hidden" onChange={handleFileUpload} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {([
            { key: "comments", label: "תכתובות", icon: MessageSquare, badge: comments.length },
            { key: "ai", label: "עוזר AI", icon: Bot, badge: 0 },
            { key: "history", label: "היסטוריה", icon: History, badge: 0 },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-violet-600 text-violet-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.badge > 0 && (
                <span className="text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-semibold">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Comments tab */}
        {tab === "comments" && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                  <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">אין תכתובות עדיין</p>
                  <p className="text-xs text-slate-300 mt-1">הוסף עדכון או הערה למשימה</p>
                </div>
              )}
              {comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{ background: "#f3eeff", color: "#7c3aed" }}>
                    {c.user_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-700">{c.user_name}</span>
                      <span className="text-xs text-slate-400">{formatTime(c.created_at)}</span>
                    </div>
                    <div className="bg-slate-50 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {c.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
            <form onSubmit={sendComment} className="p-4 border-t border-slate-100 shrink-0">
              <div className="flex gap-2 items-end">
                <textarea ref={null} value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(e as unknown as React.FormEvent); } }}
                  placeholder="הוסף עדכון או הערה... (Enter לשליחה)" rows={2} disabled={commentSending}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50 resize-none"
                  style={{ minHeight: 44 }} />
                <button type="submit" disabled={commentSending || !commentText.trim()}
                  className="h-10 w-10 rounded-xl text-white flex items-center justify-center disabled:opacity-40 transition-colors shrink-0"
                  style={{ background: "#7c3aed" }}>
                  {commentSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </>
        )}

        {/* AI tab */}
        {tab === "ai" && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                  <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Bot className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">שאל/י על המשימה</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user" ? "bg-slate-900 text-white rounded-tr-sm" : "bg-slate-100 text-slate-800 rounded-tl-sm"
                  }`}>{msg.text}</div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-end">
                  <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={sendMessage} className="p-4 border-t border-slate-100 shrink-0">
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="שאל/י על המשימה..." disabled={sending}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
                <button type="submit" disabled={sending || !input.trim()}
                  className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {historyLoading && (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            )}
            {!historyLoading && history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                <History className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-500">אין שינויים מתועדים עדיין</p>
              </div>
            )}
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "#f3eeff", color: "#7c3aed" }}>
                      {h.edited_by_name.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{h.edited_by_name}</span>
                    <span className="text-xs text-slate-400">{formatTime(h.edited_at)}</span>
                  </div>
                  <div className="space-y-1.5 mr-9">
                    {Object.entries(h.changes).map(([field, { from, to }]) => (
                      <div key={field} className="text-xs text-slate-600">
                        <span className="font-medium text-slate-500">{FIELD_LABEL[field] ?? field}:</span>{" "}
                        <span className="line-through text-slate-400">{from || "ריק"}</span>
                        {" → "}
                        <span className="font-medium text-slate-700">{to || "ריק"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transfer dialog */}
        {showTransfer && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl p-6">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6">
              <h3 className="text-base font-bold text-slate-800 mb-4">העבר משימה</h3>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">העבר אל:</label>
                <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                  <option value="">בחר משתמש...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none">
                <input type="checkbox" checked={keepOriginal} onChange={e => setKeepOriginal(e.target.checked)} className="rounded w-4 h-4 accent-violet-600" />
                <span className="text-sm text-slate-700">השאר גם תחת {currentAssigneeName}</span>
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowTransfer(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors">ביטול</button>
                <button onClick={doTransfer} disabled={!transferTo || transferring}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-colors flex items-center gap-1.5"
                  style={{ background: "#7c3aed" }}>
                  {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                  העבר
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
