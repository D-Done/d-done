"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { askDocument } from "@/lib/api";
import type { AskCitation, AskResponse } from "@/lib/api";
import type { BoundingBox } from "@/lib/types";
import {
  Loader2,
  Send,
  MapPin,
  Bot,
  User,
  Sparkles,
  FileUp,
  X,
  Paperclip,
} from "lucide-react";

const ParticleField = dynamic(
  () =>
    import("@/components/particle-field").then((m) => m.ParticleField),
  { ssr: false },
);

const PdfCitationViewer = dynamic(
  () =>
    import("@/components/pdf-citation-viewer").then(
      (m) => m.PdfCitationViewer,
    ),
  { ssr: false },
);

function convertBox2dToBbox(box2d: number[]): BoundingBox {
  const [yMin, xMin, yMax, xMax] = box2d;
  return {
    x0: xMin / 1000,
    y0: yMin / 1000,
    x1: xMax / 1000,
    y1: yMax / 1000,
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AskCitation[];
  tokens?: number | null;
  fileNames?: string[];
}

const MAX_FILES = 5;

// Variants for staggered empty state
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

export default function AiPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCitations, setDrawerCitations] = useState<AskCitation[]>([]);
  const [drawerScrollPage, setDrawerScrollPage] = useState<
    number | undefined
  >();
  const [drawerFileUrl, setDrawerFileUrl] = useState<string>("");

  const scrollKeyRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const newUrls = new Map<string, string>();
    for (const f of files) {
      newUrls.set(f.name, URL.createObjectURL(f));
    }
    setFileUrls(newUrls);
    return () => {
      for (const url of newUrls.values()) URL.revokeObjectURL(url);
    };
  }, [files]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = Array.from(incoming).filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
      );
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        const deduped = valid.filter((f) => !names.has(f.name));
        return [...prev, ...deduped].slice(0, MAX_FILES);
      });
    },
    [],
  );

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || files.length === 0 || loading) return;

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content: question,
      fileNames:
        messages.length === 0 ? files.map((f) => f.name) : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const resp: AskResponse = await askDocument(files, question);
      const assistantMsg: ChatMessage = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: resp.answer,
        citations: resp.citations,
        tokens: resp.raw_token_usage?.total_tokens ?? null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
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
  }, [input, files, loading, messages.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const openCitationDrawer = useCallback(
    (citations: AskCitation[], page?: number) => {
      setDrawerCitations(citations);
      scrollKeyRef.current += 1;
      setDrawerScrollPage(
        (page ?? citations[0]?.page ?? 1) +
          scrollKeyRef.current * 0.001,
      );
      const firstUrl = fileUrls.values().next().value ?? "";
      setDrawerFileUrl(firstUrl);
      setDrawerOpen(true);
    },
    [fileUrls],
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

  const hasFiles = files.length > 0;
  const isEmpty = messages.length === 0 && !loading;

  return (
    <>
      <div
        className="relative mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col overflow-hidden rounded-3xl bg-white/60 dark:bg-zinc-900/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-white/20 dark:ring-white/10"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Particle animation background */}
        <div className="absolute inset-0 overflow-hidden opacity-60">
          <ParticleField />
        </div>

        {/* Drag overlay */}
        <AnimatePresence>
          {dragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-indigo-500/20 backdrop-blur-sm border-2 border-dashed border-indigo-400"
            >
              <motion.div
                initial={{ scale: 0.9, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="text-center bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md p-6 rounded-2xl shadow-xl ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40"
              >
                <FileUp className="mx-auto h-12 w-12 text-indigo-500 mb-3" />
                <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  שחרר כדי להעלות
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="relative z-10 flex items-center gap-4 px-6 py-4 shrink-0 border-b border-zinc-200/50 dark:border-zinc-700/40 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              D-DONE AI
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              ניתוח מסמכים משפטיים מבוסס ביסוס חזותי
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 border-zinc-200/50 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm text-xs py-1 px-2.5 shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Gemini 3.1 Pro
          </Badge>
        </div>

        {/* File chips (Animated) */}
        <AnimatePresence>
          {hasFiles && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="relative z-10 border-b border-zinc-200/50 dark:border-zinc-700/40 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 px-6 py-3">
                <AnimatePresence>
                  {files.map((f) => (
                    <motion.span
                      layout
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      key={f.name}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 dark:bg-zinc-800/70 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-sm ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40"
                    >
                      <Paperclip className="h-3 w-3 text-zinc-400" />
                      <span className="max-w-[150px] truncate">{f.name}</span>
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                  >
                    <FileUp className="h-3 w-3" />
                    הוסף מסמך
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat messages */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth">
          {isEmpty && !hasFiles && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex h-full flex-col items-center justify-center gap-4"
            >
              <motion.div
                variants={itemVariants}
                className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/60 dark:bg-zinc-800/60 backdrop-blur-xl shadow-lg ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40"
              >
                <Bot className="h-10 w-10 text-indigo-500" />
              </motion.div>
              <motion.h2
                variants={itemVariants}
                className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight"
                style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)" }}
              >
                שלום, אני D-DONE AI
              </motion.h2>
              <motion.p
                variants={itemVariants}
                className="max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed"
              >
                העלה עד 5 מסמכים משפטיים ושאל שאלות. אמצא את התשובה ואסמן
                בדיוק היכן היא מופיעה בתוך המסמך.
              </motion.p>
              <motion.div variants={itemVariants} className="mt-4">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 hover:shadow-indigo-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] h-11 px-6 font-medium gap-2"
                >
                  <FileUp className="h-5 w-5" />
                  העלה מסמכים להתחלה
                </Button>
              </motion.div>
            </motion.div>
          )}

          {isEmpty && hasFiles && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
              className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500"
            >
              <Bot className="h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">המסמכים מוכנים. שאל אותי עליהם.</p>
            </motion.div>
          )}

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
                      : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/20"
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
                      ? "bg-indigo-600 text-white ring-indigo-500/50 rounded-tr-sm"
                      : "bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md text-zinc-800 dark:text-zinc-200 ring-zinc-200/50 dark:ring-zinc-700/40 rounded-tl-sm"
                  }`}
                  dir="auto"
                >
                  {msg.fileNames && (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      {msg.fileNames.map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur-sm"
                        >
                          <Paperclip className="h-3 w-3" />
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
                      {msg.citations.map((cit, idx) => (
                        <button
                          key={idx}
                          onClick={() => openCitationDrawer(msg.citations!, cit.page)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-zinc-800 hover:ring-indigo-200 dark:hover:ring-indigo-500/30 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/20 shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-3xl rounded-tl-sm bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/40 px-5 py-3.5 text-[14px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2.5 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="animate-pulse">מנתח את המסמכים...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} className="h-2" />
        </div>

        {/* Input Area */}
        <div className="relative z-10 p-4 sm:p-6 shrink-0 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md border-t border-zinc-200/50 dark:border-zinc-700/40">
          <div className="relative flex items-end gap-3 rounded-2xl bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl ring-1 ring-inset ring-zinc-200/80 dark:ring-zinc-700/80 p-2 shadow-sm focus-within:ring-indigo-500/50 focus-within:shadow-md transition-all duration-300">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors duration-150"
              title="צרף מסמכים"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasFiles ? "שאל שאלה על המסמכים..." : "העלה מסמכים כדי להתחיל"
              }
              disabled={!hasFiles || loading}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
              dir="auto"
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || !hasFiles || loading}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:opacity-50"
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

      {/* Citation drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-full sm:max-w-2xl p-0 flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50">
            <SheetTitle className="text-xl font-semibold tracking-tight">ציטוט ממסמך</SheetTitle>
            <SheetDescription className="text-sm font-medium">
              {drawerCitations.length} אזור
              {drawerCitations.length !== 1 ? "ים" : ""} מסומנ
              {drawerCitations.length !== 1 ? "ים" : ""}
            </SheetDescription>
          </SheetHeader>

          {drawerCitations.length > 0 && (
            <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
              {drawerCitations.map((cit, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    scrollKeyRef.current += 1;
                    setDrawerScrollPage(
                      cit.page + scrollKeyRef.current * 0.001,
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {`עמ׳ ${cit.page}`}
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
              <div className="h-full flex items-center justify-center text-sm font-medium text-zinc-400">
                אין מסמך לתצוגה
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
