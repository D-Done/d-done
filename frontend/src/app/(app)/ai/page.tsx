"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
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
  askInConversationStream,
  createConversation,
  deleteConversation,
  getConversation,
  getFileBlobUrl,
  getMe,
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
  Brain,
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
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
// MessageSquare is used in the empty-state welcome screen cards

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
  const [userName, setUserName] = useState<string | null>(null);
  const [greetingVariant] = useState(() => Math.floor(Math.random() * 2));

  useEffect(() => {
    getMe().then((u) => { if (u) setUserName(u.name ?? u.email?.split("@")[0] ?? null); });
  }, []);

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
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [modelMode, setModelMode] = useState<"flash" | "pro">("flash");
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef<string>("");

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

  // ── Re-focus input after response finishes ─────────────────────────────
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

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
  }, [messages, loading, streamingText]);

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

  const handleSend = useCallback(async (overrideText?: string) => {
    const question = (overrideText ?? input).trim();
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

    // Use streaming for project-context and general chat; fallback to non-streaming for file uploads.
    if (!hasUploadedFiles) {
      const abort = new AbortController();
      streamAbortRef.current = abort;
      streamTextRef.current = "";
      setStreamingText("");
      try {
        await askInConversationStream(
          convId,
          question,
          modelMode,
          (chunk) => {
            streamTextRef.current += chunk;
            setStreamingText(streamTextRef.current);
          },
          abort.signal,
        );
        setMessages((prev) => [
          ...prev,
          { id: "a-" + Date.now(), role: "assistant" as const, content: streamTextRef.current },
        ]);
        if (!conversations.find((c) => c.id === convId)?.title) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, title: question.slice(0, 60) } : c,
            ),
          );
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          setStreamingText(null);
          streamAbortRef.current = null;
          setLoading(false);
          return;
        }
        // Streaming endpoint not available — fall back to non-streaming.
        console.warn("Streaming failed, falling back to non-streaming:", err);
        setStreamingText(null);
        try {
          const resp = await askInConversation(convId, question, undefined, modelMode);
          setMessages((prev) => [
            ...prev,
            { id: "a-" + Date.now(), role: "assistant" as const, content: resp.answer, citations: resp.citations },
          ]);
          if (!conversations.find((c) => c.id === convId)?.title) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId ? { ...c, title: question.slice(0, 60) } : c,
              ),
            );
          }
        } catch (fallbackErr) {
          setMessages((prev) => [
            ...prev,
            { id: "e-" + Date.now(), role: "assistant" as const, content: "שגיאה בעיבוד השאלה. נסה שנית." },
          ]);
          console.error("Fallback ask also failed:", fallbackErr);
        }
      } finally {
        setStreamingText(null);
        streamAbortRef.current = null;
        setLoading(false);
      }
    } else {
      // File-upload mode: use non-streaming endpoint
      try {
        const resp = await askInConversation(convId, question, files, modelMode);
        setMessages((prev) => [
          ...prev,
          {
            id: "a-" + Date.now(),
            role: "assistant" as const,
            content: resp.answer,
            citations: resp.citations,
            tokens: resp.raw_token_usage?.total_tokens ?? null,
          },
        ]);
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
          { id: "e-" + Date.now(), role: "assistant" as const, content: "שגיאה בעיבוד השאלה. נסה שנית." },
        ]);
        console.error("Ask failed:", err);
      } finally {
        setLoading(false);
      }
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
    modelMode,
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
              <div className="shrink-0 px-3 py-3 border-b border-zinc-200/50 dark:border-zinc-700/40">
                <Button
                  onClick={handleNewConversation}
                  size="sm"
                  className="w-full rounded-xl bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white text-white gap-2 h-9 font-medium shadow-sm transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  שיחה חדשה
                </Button>
              </div>

              {/* Conversations list */}
              <div className="flex-1 min-h-0 overflow-y-auto py-2">
                {convsLoading && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                )}
                {!convsLoading && conversations.length === 0 && (
                  <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-10 px-4">
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
                    <div key={label} className="mb-1">
                      <p className="px-4 pb-1 pt-3 text-[10px] font-medium text-zinc-400/70 dark:text-zinc-600 tracking-wide">{label}</p>
                      {items.map((conv) => {
                        const isActive = currentConvId === conv.id;
                        return (
                          <div key={conv.id} className="relative px-2">
                            <button
                              onClick={() => selectConversation(conv.id)}
                              className={`group w-full text-right rounded-lg px-3 py-2 transition-all duration-150 flex flex-col gap-1 ${
                                isActive
                                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 min-w-0">
                                <span className={`flex-1 text-[13px] font-medium leading-snug line-clamp-1 text-right truncate ${isActive ? "text-white dark:text-zinc-900" : ""}`}>
                                  {conv.title || t("ai_new_conv", lang)}
                                </span>
                                <button
                                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                                  className={`opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 transition-all duration-100 ${
                                    isActive
                                      ? "hover:bg-white/20 text-white/70 hover:text-white"
                                      : "hover:bg-red-100 dark:hover:bg-red-500/20 text-zinc-400 hover:text-red-500"
                                  }`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              {conv.project_title && (
                                <span className={`inline-flex items-center gap-1 self-end rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                                  isActive
                                    ? "bg-white/15 text-white/80 dark:bg-zinc-900/20 dark:text-zinc-900/70"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                                }`}>
                                  <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate max-w-[140px]">{conv.project_title}</span>
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}
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
              {modelMode === "pro" ? "Gemini — Thinking" : "Gemini — Fast"}
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
                dir="ltr"
                className="flex h-full flex-col items-center justify-center gap-6 px-4"
              >
                {/* Title + subtitle */}
                <motion.div variants={itemVariants} className="text-center space-y-3">
                  <h2 className="text-[2rem] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                    {greetingVariant === 0 ? (
                      <>{userName ? `Hi ${userName},` : "Hi,"}<br />What&apos;s on your mind?</>
                    ) : (
                      <>The mic is yours,<br />{userName ?? ""}</>
                    )}
                  </h2>
                  <p className="max-w-sm text-sm text-zinc-400 dark:text-zinc-500 leading-relaxed">
                    Connect a project, upload documents, or ask anything — D-DONE AI will answer with full context and citations.
                  </p>
                </motion.div>

                {/* Starter question cards */}
                <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 w-full max-w-lg mt-1">
                  {[
                    { icon: Sparkles, label: "What can D-DONE AI do?", sub: "Capabilities & features" },
                    { icon: Link2, label: "How do I link a project?", sub: "Connect your deal" },
                    { icon: MessageSquare, label: "How do conversations work?", sub: "Memory & context" },
                  ].map(({ icon: Icon, label, sub }) => (
                    <button
                      key={label}
                      onClick={() => { setInput(label); handleSend(label); }}
                      className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/60 p-4 text-left hover:border-zinc-900 dark:hover:border-zinc-500 hover:shadow-sm transition-all duration-200"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700/60 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900 transition-colors duration-200">
                        <Icon className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-300 group-hover:text-white dark:group-hover:text-zinc-900 transition-colors duration-200" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">{label}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>
                      </div>
                    </button>
                  ))}
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

              {loading && streamingText !== null ? (
                /* Streaming bubble — shows text as it arrives */
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
                  <div className="rounded-3xl rounded-tl-sm bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40 px-5 py-3.5 text-[14px] text-zinc-800 dark:text-zinc-200 shadow-sm max-w-[80%]">
                    {streamingText ? (
                      <MarkdownContent content={streamingText} isUser={false} />
                    ) : (
                      <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="animate-pulse">{t("ai_analyzing", lang)}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : loading ? (
                /* File-upload mode spinner */
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
              ) : null}
            </AnimatePresence>
            <div ref={chatEndRef} className="h-2" />
          </div>


          {/* Input area */}
          <div className="relative z-10 p-4 sm:p-5 shrink-0 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md border-t border-zinc-200/50 dark:border-zinc-700/40">
            <div className="relative flex items-end gap-3 rounded-2xl bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl ring-1 ring-inset ring-zinc-200/80 dark:ring-zinc-700/80 p-2 shadow-sm focus-within:ring-zinc-800/40 focus-within:shadow-md transition-all duration-300">
              {/* Model toggle — always visible */}
              <button
                onClick={() => setModelMode((m) => m === "flash" ? "pro" : "flash")}
                title={modelMode === "flash" ? "Switch to Thinking (slower, smarter)" : "Switch to Fast (faster)"}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-all duration-150 ${
                  modelMode === "pro"
                    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-300/60 dark:ring-violet-700/60"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
              >
                {modelMode === "pro" ? (
                  <><Brain className="h-4 w-4" /><span>Thinking</span></>
                ) : (
                  <><Zap className="h-4 w-4" /><span>Fast</span></>
                )}
              </button>

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
                onClick={() => handleSend()}
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
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden" dir={dir}>
          <DialogHeader className="px-5 pt-5 pb-4 border-b pe-10">
            <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {t("ai_link_dialog_title", lang)}
            </DialogTitle>
          </DialogHeader>
          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 py-12">
              {t("ai_no_projects", lang)}
            </p>
          ) : (
            <div className="py-2 max-h-72 overflow-y-auto">
              {projects.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => handleLinkProject(p.id, p.title)}
                  className={cn(
                    "w-full text-right px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center gap-3",
                    i !== projects.length - 1 && "border-b border-zinc-100 dark:border-zinc-800"
                  )}
                >
                  <FolderOpen className="h-4 w-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {p.title}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {p.file_count} {t("ai_files_count", lang)} · {new Date(p.created_at).toLocaleDateString(locale)}
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
