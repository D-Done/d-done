"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  askInConversation,
  createConversation,
  deleteConversation,
  getConversation,
  getFileBlobUrl,
  listConversations,
  listProjects,
  updateConversation,
} from "@/lib/api";
import type {
  AskCitation,
  ConversationDetail,
  ConversationMessageOut,
  ConversationOut,
  ProjectFileOut,
} from "@/lib/api";
import type { BoundingBox, ProjectListItem } from "@/lib/types";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  Bot,
  FileUp,
  FolderOpen,
  Link2,
  Link2Off,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Sparkles,
  ShieldCheck,
  BarChart2,
  FileSearch,
  Trash2,
  User,
  X,
} from "lucide-react";

const PdfCitationViewer = dynamic(
  () =>
    import("@/components/pdf-citation-viewer").then(
      (m) => m.PdfCitationViewer,
    ),
  { ssr: false },
);

import ReactMarkdown from "react-markdown";

function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 mr-4 space-y-1 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 mr-4 space-y-1 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-zinc-100">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 first:mt-0 text-zinc-900 dark:text-zinc-100">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0 text-zinc-800 dark:text-zinc-200">{children}</h3>,
        code: ({ children }) => (
          <code className="rounded bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 text-[13px] font-mono text-zinc-700 dark:text-zinc-300">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-900 p-3 text-[13px] font-mono text-zinc-700 dark:text-zinc-300">{children}</pre>
        ),
        hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
        blockquote: ({ children }) => (
          <blockquote className="border-r-2 border-zinc-400 pr-3 italic text-zinc-500 dark:text-zinc-400 my-2">{children}</blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

function convertBox2dToBbox(box2d: number[]): BoundingBox {
  const [yMin, xMin, yMax, xMax] = box2d;
  return { x0: xMin / 1000, y0: yMin / 1000, x1: xMax / 1000, y1: yMax / 1000 };
}

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AskCitation[];
  tokens?: number | null;
  fileNames?: string[];
}

function toLocal(m: ConversationMessageOut): LocalMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    citations: (m.citations as AskCitation[] | undefined) ?? undefined,
    tokens: m.tokens ?? undefined,
    fileNames: m.file_names ?? undefined,
  };
}

const MAX_FILES = 5;

// ── Animation variants ────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 25 },
  },
};

// ── Page component ────────────────────────────────────────────────────────

export default function AiPage() {
  const { lang, dir } = useLanguage();
  const locale = lang === "en" ? "en-US" : "he-IL";
  // Conversations sidebar
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [convsLoading, setConvsLoading] = useState(true);

  // Active conversation
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFileOut[]>([]);
  const [projectFileUrls, setProjectFileUrls] = useState<Map<string, string>>(new Map());

  // File upload (non-project mode)
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map());
  const [dragOver, setDragOver] = useState(false);

  // Chat
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");

  // Citation drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCitations, setDrawerCitations] = useState<AskCitation[]>([]);
  const [drawerScrollPage, setDrawerScrollPage] = useState<number | undefined>();
  const [drawerFileUrl, setDrawerFileUrl] = useState<string>("");
  const scrollKeyRef = useRef(0);

  // Project picker dialog
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load conversations on mount ─────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Scroll chat on new messages ─────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Object URLs for uploaded files ─────────────────────────────────────

  useEffect(() => {
    const newUrls = new Map<string, string>();
    for (const f of files) newUrls.set(f.name, URL.createObjectURL(f));
    setFileUrls(newUrls);
    return () => { for (const url of newUrls.values()) URL.revokeObjectURL(url); };
  }, [files]);

  // ── Signed URLs for project files ──────────────────────────────────────

  useEffect(() => {
    if (!projectId || projectFiles.length === 0) {
      setProjectFileUrls(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const urls = new Map<string, string>();
      await Promise.all(
        projectFiles.map(async (pf) => {
          try {
            const url = await getFileBlobUrl(projectId, pf.id);
            if (!cancelled) urls.set(pf.id, url);
          } catch {
            // skip files that can't be fetched
          }
        }),
      );
      if (!cancelled) setProjectFileUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [projectId, projectFiles]);

  // ── Select / load a conversation ────────────────────────────────────────

  const selectConversation = useCallback(async (id: string) => {
    if (id === currentConvId) return;
    setCurrentConvId(id);
    setMessages([]);
    setProjectId(null);
    setProjectTitle(null);
    setProjectFiles([]);
    setFiles([]);
    setConvLoading(true);
    try {
      const detail: ConversationDetail = await getConversation(id);
      setMessages(detail.messages.map(toLocal));
      setProjectId(detail.project_id);
      setProjectTitle(detail.project_title);
      setProjectFiles(detail.project_files ?? []);
    } finally {
      setConvLoading(false);
    }
  }, [currentConvId]);

  // ── Create new conversation ─────────────────────────────────────────────

  const handleNewConversation = useCallback(async () => {
    const conv = await createConversation();
    setConversations((prev) => [conv, ...prev]);
    setCurrentConvId(conv.id);
    setMessages([]);
    setProjectId(null);
    setProjectTitle(null);
    setProjectFiles([]);
    setFiles([]);
  }, []);

  // ── Delete conversation ─────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConvId === id) {
        setCurrentConvId(null);
        setMessages([]);
        setProjectId(null);
        setProjectTitle(null);
        setProjectFiles([]);
        setFiles([]);
      }
    },
    [currentConvId],
  );

  // ── Link project to conversation ────────────────────────────────────────

  const openProjectPicker = useCallback(async () => {
    setProjectPickerOpen(true);
    setProjectsLoading(true);
    try {
      const list = await listProjects();
      setProjects(list);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const handleLinkProject = useCallback(
    async (pid: string, ptitle: string) => {
      setProjectPickerOpen(false);

      try {
        let convId = currentConvId;

        if (!convId) {
          const conv = await createConversation({ project_id: pid });
          setConversations((prev) => [conv, ...prev]);
          setCurrentConvId(conv.id);
          convId = conv.id;
        } else {
          await updateConversation(convId, { project_id: pid });
        }

        const detail = await getConversation(convId);
        setProjectId(detail.project_id);
        setProjectTitle(detail.project_title);
        setProjectFiles(detail.project_files ?? []);
        setFiles([]);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, project_id: pid, project_title: ptitle }
              : c,
          ),
        );
      } catch (err) {
        console.error("Failed to link project:", err);
        alert("שגיאה בקישור הפרויקט: " + (err instanceof Error ? err.message : String(err)));
      }
    },
    [currentConvId],
  );

  const handleUnlinkProject = useCallback(async () => {
    if (!currentConvId) return;
    await updateConversation(currentConvId, { clear_project: true });
    setProjectId(null);
    setProjectTitle(null);
    setProjectFiles([]);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId
          ? { ...c, project_id: null, project_title: null }
          : c,
      ),
    );
  }, [currentConvId]);

  // ── File upload helpers (non-project mode) ──────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const deduped = valid.filter((f) => !names.has(f.name));
      return [...prev, ...deduped].slice(0, MAX_FILES);
    });
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!projectId) addFiles(e.dataTransfer.files);
    },
    [addFiles, projectId],
  );

  // ── Send message ────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const hasProjectContext = !!projectId;
    const hasUploadedFiles = files.length > 0;

    let convId = currentConvId;

    // Auto-create conversation on first send
    if (!convId) {
      try {
        const conv = await createConversation(
          projectId ? { project_id: projectId } : undefined,
        );
        setConversations((prev) => [conv, ...prev]);
        setCurrentConvId(conv.id);
        convId = conv.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to create conversation:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: "e-" + Date.now(),
            role: "assistant" as const,
            content: `שגיאה ביצירת שיחה: ${msg}`,
          },
        ]);
        return;
      }
    }

    const userMsg: LocalMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content: question,
      fileNames: messages.length === 0 && !hasProjectContext
        ? files.map((f) => f.name)
        : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const resp = await askInConversation(
        convId,
        question,
        hasProjectContext ? undefined : files,
      );
      const assistantMsg: LocalMessage = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: resp.answer,
        citations: resp.citations,
        tokens: resp.raw_token_usage?.total_tokens ?? null,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update conversation title if it was just auto-set
      if (!conversations.find((c) => c.id === convId)?.title) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, title: question.slice(0, 60) } : c,
          ),
        );
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: "e-" + Date.now(),
          role: "assistant",
          content: "שגיאה בעיבוד השאלה. נסה שנית.",
        },
      ]);
      console.error("Ask failed:", err);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [
    input,
    loading,
    projectId,
    projectFiles,
    files,
    messages.length,
    currentConvId,
    conversations,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Citation drawer ─────────────────────────────────────────────────────

  const openCitationDrawer = useCallback(
    (citations: AskCitation[], page?: number) => {
      setDrawerCitations(citations);
      scrollKeyRef.current += 1;
      setDrawerScrollPage(
        (page ?? citations[0]?.page ?? 1) + scrollKeyRef.current * 0.001,
      );
      // Use project file URL or uploaded file URL
      const firstProjectUrl = projectFiles.length > 0
        ? (projectFileUrls.get(projectFiles[0].id) ?? "")
        : "";
      const firstUploadUrl = fileUrls.values().next().value ?? "";
      setDrawerFileUrl(firstProjectUrl || firstUploadUrl);
      setDrawerOpen(true);
    },
    [projectFiles, projectFileUrls, fileUrls],
  );

  const drawerBoxesByPage = useMemo<Record<number, BoundingBox[]>>(() => {
    const map: Record<number, BoundingBox[]> = {};
    for (const c of drawerCitations) {
      const p = c.page ?? 1;
      if (!map[p]) map[p] = [];
      map[p].push(convertBox2dToBbox(c.box_2d));
    }
    return map;
  }, [drawerCitations]);

  // ── Derived booleans ────────────────────────────────────────────────────

  const hasProjectContext = !!projectId;
  const hasUploadedFiles = files.length > 0;
  const hasContext = hasProjectContext || hasUploadedFiles;
  const isEmpty = messages.length === 0 && !loading && !convLoading;
  const canSend = !!input.trim() && !loading;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-[calc(100vh-6rem)] gap-3">
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="sidebar"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 256 }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col overflow-hidden rounded-3xl bg-white/60 dark:bg-zinc-900/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-white/20 dark:ring-white/10"
            >
              {/* Sidebar header */}
              <div className="shrink-0 px-4 py-4 border-b border-zinc-200/50 dark:border-zinc-700/40">
                <Button
                  onClick={handleNewConversation}
                  size="sm"
                  className="w-full rounded-xl bg-zinc-900 hover:bg-zinc-700 text-white gap-2 h-9 font-medium shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  שיחה חדשה
                </Button>
              </div>

              {/* Conversations list */}
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
                {convsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  </div>
                )}
                {!convsLoading && conversations.length === 0 && (
                  <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-8 px-3">
                    {t("ai_no_convs", lang)}
                  </p>
                )}
                {(() => {
                  const now = new Date();
                  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate() - 1);
                  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);
                  const groups: { label: string; items: typeof conversations }[] = [
                    { label: lang === "en" ? "Today" : "היום", items: conversations.filter(c => new Date(c.updated_at) >= startOfToday) },
                    { label: lang === "en" ? "Yesterday" : "אתמול", items: conversations.filter(c => new Date(c.updated_at) >= startOfYesterday && new Date(c.updated_at) < startOfToday) },
                    { label: lang === "en" ? "Past 7 days" : "7 ימים אחרונים", items: conversations.filter(c => new Date(c.updated_at) >= startOfWeek && new Date(c.updated_at) < startOfYesterday) },
                    { label: lang === "en" ? "Earlier" : "קודם לכן", items: conversations.filter(c => new Date(c.updated_at) < startOfWeek) },
                  ];
                  return groups.map(({ label, items }) => items.length === 0 ? null : (
                    <div key={label}>
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
                      {items.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => selectConversation(conv.id)}
                          className={`group w-full text-right rounded-xl px-3 py-2.5 transition-all duration-150 flex flex-col gap-0.5 ${
                            currentConvId === conv.id
                              ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-600/40"
                              : "hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40 text-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
                            <span className="flex-1 text-xs font-medium leading-snug line-clamp-1 text-right">
                              {conv.title || t("ai_new_conv", lang)}
                            </span>
                            <button
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                              className="opacity-0 group-hover:opacity-100 shrink-0 rounded-md p-0.5 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {conv.project_title && (
                            <div className="flex items-center gap-1 pr-5">
                              <FolderOpen className="h-3 w-3 text-zinc-400 shrink-0" />
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                                {conv.project_title}
                              </span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat panel ──────────────────────────────────────────────── */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-3xl bg-white/60 dark:bg-zinc-900/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-white/20 dark:ring-white/10"
          onDragOver={(e) => {
            e.preventDefault();
            if (!projectId) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Subtle gradient background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-violet-100/40 dark:bg-violet-900/10 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sky-100/40 dark:bg-sky-900/10 blur-3xl" />
          </div>

          {/* Drag overlay */}
          <AnimatePresence>
            {dragOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-zinc-900/10 backdrop-blur-sm border-2 border-dashed border-zinc-400"
              >
                <motion.div
                  initial={{ scale: 0.9, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="text-center bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40"
                >
                  <FileUp className="mx-auto h-12 w-12 text-zinc-500 mb-3" />
                  <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                    {t("ai_drop_to_upload", lang)}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <div className="relative z-10 flex items-center gap-3 px-4 py-3 shrink-0 border-b border-zinc-200/50 dark:border-zinc-700/40 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900/10 text-zinc-800 dark:text-zinc-300 ring-1 ring-inset ring-zinc-900/15">
              <Bot className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                D-DONE AI
              </h1>
              {projectTitle ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-300 font-medium truncate">
                  {projectTitle}
                </p>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {t("ai_subtitle", lang)}
                </p>
              )}
            </div>

            {/* Project link/unlink */}
            {(
              projectTitle ? (
                <button
                  onClick={handleUnlinkProject}
                  title={t("ai_unlink_title", lang)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700 bg-white/60 dark:bg-zinc-800/60"
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  {t("ai_unlink", lang)}
                </button>
              ) : (
                <button
                  onClick={openProjectPicker}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/10 transition-all ring-1 ring-inset ring-zinc-200 dark:ring-zinc-600/40 bg-white/60 dark:bg-zinc-800/60"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {t("ai_link_project", lang)}
                </button>
              )
            )}

            <Badge
              variant="outline"
              className="gap-1.5 border-zinc-200/50 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm text-xs py-1 px-2.5 shadow-sm shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
              Gemini 3 Flash
            </Badge>
          </div>

          {/* Context chips — project files (read-only) or uploaded files */}
          <AnimatePresence>
            {(hasProjectContext || hasUploadedFiles) && (
              <motion.div
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="relative z-10 border-b border-zinc-200/50 dark:border-zinc-700/40 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  {hasProjectContext ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-700/50 px-2.5 py-1 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span>{projectTitle || t("ai_linked_project", lang)}</span>
                    </span>
                  ) : (
                    <>
                      <AnimatePresence>
                        {files.map((f) => (
                          <motion.span
                            layout
                            key={f.name}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 dark:bg-zinc-800/70 backdrop-blur-md px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-sm ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40"
                          >
                            <Paperclip className="h-3 w-3 text-zinc-400" />
                            <span className="max-w-[140px] truncate">{f.name}</span>
                            <button
                              onClick={() => removeFile(f.name)}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                              <X className="h-3 w-3 text-zinc-500" />
                            </button>
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      {files.length < MAX_FILES && (
                        <motion.button
                          layout
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                        >
                          <FileUp className="h-3 w-3" />
                          {t("ai_add", lang)}
                        </motion.button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 scroll-smooth">
            {/* No conversation selected — welcome screen */}
            {!currentConvId && !loading && (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex h-full flex-col items-center justify-center gap-6 px-4"
              >
                {/* Icon */}
                <motion.div variants={itemVariants} className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/25">
                    <Sparkles className="h-9 w-9 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-white dark:ring-zinc-900 shadow-sm">
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </div>
                </motion.div>

                {/* Title + subtitle */}
                <motion.div variants={itemVariants} className="text-center space-y-2">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t("ai_welcome_title", lang)}
                  </h2>
                  <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {t("ai_welcome_body", lang)}
                  </p>
                </motion.div>

                {/* Starter question cards */}
                <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 w-full max-w-xl mt-1">
                  {[
                    { icon: FileSearch, label: lang === "en" ? "What is a Zero Report?" : "מה זה דוח אפס?", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40" },
                    { icon: ShieldCheck, label: lang === "en" ? "What's checked in due diligence?" : "מה בודקים בבדיקת נאותות?", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/40" },
                    { icon: BarChart2, label: lang === "en" ? "RE financing risks?" : "סיכונים במימון נדל\"ן?", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                  ].map(({ icon: Icon, label, color, bg }) => (
                    <button
                      key={label}
                      onClick={() => { setInput(label); inputRef.current?.focus(); }}
                      className="group flex flex-col items-center gap-2.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60 bg-white/70 dark:bg-zinc-800/50 p-4 text-center backdrop-blur-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all duration-200"
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
                        <Icon className={`h-4.5 w-4.5 ${color}`} strokeWidth={1.75} />
                      </div>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-snug">
                        {label}
                      </span>
                    </button>
                  ))}
                </motion.div>

                {/* Action buttons */}
                <motion.div variants={itemVariants} className="flex gap-3">
                  <Button
                    onClick={handleNewConversation}
                    className="rounded-xl bg-zinc-900 text-white shadow-lg hover:bg-zinc-700 transition-all duration-200 h-10 px-5 font-medium gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {t("ai_new_conv", lang)}
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="rounded-xl h-10 px-5 font-medium gap-2"
                  >
                    <FileUp className="h-4 w-4" />
                    {t("ai_upload_docs", lang)}
                  </Button>
                </motion.div>
              </motion.div>
            )}

            {/* Conversation loading */}
            {convLoading && (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              </div>
            )}

            {/* Empty conversation */}
            {currentConvId && !convLoading && isEmpty && !hasContext && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500"
              >
                <Bot className="h-10 w-10 opacity-50" />
                <p className="text-sm font-medium">
                  {projectTitle
                    ? t("ai_ready_project", lang)
                    : t("ai_ready_no_context", lang)}
                </p>
              </motion.div>
            )}

            {currentConvId && !convLoading && isEmpty && hasContext && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500"
              >
                <Bot className="h-10 w-10 opacity-50" />
                <p className="text-sm font-medium">
                  {projectTitle ? `${projectTitle} ${t("ai_project_ready", lang)}` : t("ai_docs_ready", lang)}
                </p>
              </motion.div>
            )}

            {/* Messages */}
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 25 }}
                  className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ${
                      msg.role === "user"
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 ring-zinc-200/50 dark:ring-zinc-700/50"
                        : "bg-zinc-900/10 text-zinc-800 dark:text-zinc-300 ring-zinc-900/15"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ring-1 ring-inset ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-white ring-zinc-800/40 rounded-tr-sm"
                        : "bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md text-zinc-800 dark:text-zinc-200 ring-zinc-200/50 dark:ring-zinc-700/40 rounded-tl-sm"
                    }`}
                    dir="auto"
                  >
                    {msg.fileNames && msg.fileNames.length > 0 && (
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {hasProjectContext ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
                            <FolderOpen className="h-3 w-3" />
                            {projectTitle || "פרויקט מקושר"}
                          </span>
                        ) : (
                          msg.fileNames.map((n) => (
                            <span
                              key={n}
                              className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur-sm"
                            >
                              <Paperclip className="h-3 w-3" />
                              {n}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                    <MarkdownContent content={msg.content} isUser={msg.role === "user"} />

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
                        {msg.citations.map((cit, idx) => (
                          <button
                            key={idx}
                            onClick={() => openCitationDrawer(msg.citations!, cit.page)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:ring-zinc-200 dark:hover:ring-zinc-600/40 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <MapPin className="h-3 w-3" />
                            <span className="max-w-[180px] truncate">
                              {cit.label || `עמ׳ ${cit.page}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.tokens != null && (
                      <div className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                        {msg.tokens.toLocaleString()} tokens
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 260, damping: 25 }}
                  className="flex gap-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-zinc-900/10 text-zinc-800 dark:text-zinc-300 ring-1 ring-inset ring-zinc-900/15 shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-3xl rounded-tl-sm bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40 px-5 py-3.5 text-[14px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2.5 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                    <span className="animate-pulse">{t("ai_analyzing", lang)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={chatEndRef} className="h-2" />
          </div>

          {/* Quick replies */}
          {!loading && (
            <div className="relative z-10 flex flex-wrap gap-2 px-4 pb-2 pt-1">
              {(hasProjectContext
                ? lang === "en"
                  ? ["Summarize the documents", "What are the main risks?", "List the deal parties", "Check key dates and deadlines"]
                  : ["סכם את המסמכים", "מה הסיכונים העיקריים?", "פרט את הצדדים בעסקה", "בדוק תאריכים ומועדים חשובים"]
                : hasUploadedFiles
                  ? lang === "en"
                    ? ["Summarize the document", "What are the key points?", "What risks exist?", "What are the important dates?"]
                    : ["סכם את המסמך", "מה הנקודות העיקריות?", "אילו סיכונים קיימים?", "מה התאריכים החשובים?"]
                  : lang === "en"
                    ? ["What's checked in due diligence?", "What are RE financing risks?", "What is a Zero Report?"]
                    : ["מה בודקים בבדיקת נאותות?", "מה הסיכונים במימון נדל\"ן?", "מה זה דוח אפס?"]
              ).map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="rounded-full text-xs px-3 py-1.5 bg-white/70 dark:bg-zinc-800/70 text-zinc-800 dark:text-zinc-300 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-600/40 hover:bg-zinc-100 dark:hover:bg-zinc-700/10 transition-colors shadow-sm backdrop-blur-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="relative z-10 p-4 sm:p-5 shrink-0 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md border-t border-zinc-200/50 dark:border-zinc-700/40">
            <div className="relative flex items-end gap-3 rounded-2xl bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl ring-1 ring-inset ring-zinc-200/80 dark:ring-zinc-700/80 p-2 shadow-sm focus-within:ring-zinc-800/40 focus-within:shadow-md transition-all duration-300">
              {/* File upload button — only in non-project mode */}
              {!hasProjectContext && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors duration-150"
                  title={t("ai_attach", lang)}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("ai_placeholder", lang)}
                disabled={loading}
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
                dir="auto"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl bg-zinc-900 hover:bg-zinc-700 shadow-sm transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Send className="h-4 w-4 text-white" />
                )}
              </Button>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* ── Project picker dialog ──────────────────────────────────────── */}
      <Dialog open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="text-right">{t("ai_link_dialog_title", lang)}</DialogTitle>
          </DialogHeader>
          {projectsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 py-8">
              {t("ai_no_projects", lang)}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleLinkProject(p.id, p.title)}
                  className="w-full text-right rounded-xl px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-700/10 transition-colors group flex items-center gap-3"
                >
                  <FolderOpen className="h-4 w-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {p.title}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {p.file_count} {t("ai_files_count", lang)} ·{" "}
                      {new Date(p.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Citation drawer ────────────────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-full sm:max-w-2xl p-0 flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50">
            <SheetTitle className="text-xl font-semibold tracking-tight">
              {t("ai_citation_title", lang)}
            </SheetTitle>
            <SheetDescription className="text-sm font-medium">
              {drawerCitations.length}{" "}
              {drawerCitations.length !== 1
                ? t("ai_citation_regions", lang)
                : t("ai_citation_region", lang)}
            </SheetDescription>
          </SheetHeader>

          {drawerCitations.length > 0 && (
            <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
              {drawerCitations.map((cit, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    scrollKeyRef.current += 1;
                    setDrawerScrollPage(cit.page + scrollKeyRef.current * 0.001);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {`${t("ai_page_prefix", lang)} ${cit.page}`}
                  {cit.label ? ` — ${cit.label}` : ""}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden bg-zinc-100/50 dark:bg-zinc-950/50">
            {drawerFileUrl ? (
              <PdfCitationViewer
                url={drawerFileUrl}
                pageNumber={Math.round(drawerScrollPage ?? 1)}
                allPages
                scrollToPage={drawerScrollPage}
                boundingBoxesByPage={drawerBoxesByPage}
                maxWidth={600}
                heightClassName="h-full"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-zinc-400">
                <MapPin className="h-8 w-8 opacity-40" />
                <p>אין מסמך לתצוגה</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
