"use client";

import {
  useCallback, useEffect, useRef, useState, use,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, BookOpen, FileText, Loader2, Plus, Send, Trash2, X,
} from "lucide-react";
import {
  chatNotebook,
  clearNotebookChat,
  deleteNotebookSource,
  getNotebook,
  renameNotebook,
  uploadNotebookSources,
} from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { NotebookDetail, NotebookMessage, NotebookSource } from "@/lib/types";

// ── SSE parser ──────────────────────────────────────────────────────────────
async function* parseSSE(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw) { try { yield JSON.parse(raw); } catch { /* ignore */ } }
      }
    }
  }
}

// ── Citation rendering ──────────────────────────────────────────────────────
function renderWithCitations(text: string, sources: NotebookSource[]) {
  // Replace [N] with a styled superscript badge
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const src = sources[num - 1];
      return (
        <sup
          key={i}
          title={src?.original_name}
          className="mx-0.5 inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary"
        >
          {num}
        </sup>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, sources }: { msg: NotebookMessage; sources: NotebookSource[] }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }

  // Parse cited source numbers
  const cited = Array.from(new Set(
    [...msg.content.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10))
  )).filter((n) => n >= 1 && n <= sources.length);

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <BookOpen className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
          {msg.content.split("\n").map((line, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {renderWithCitations(line, sources)}
            </p>
          ))}
        </div>
        {cited.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cited.map((n) => (
              <span
                key={n}
                className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                <FileText className="h-3 w-3" />
                {sources[n - 1]?.original_name ?? `Source ${n}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { lang } = useLanguage();
  const router = useRouter();

  const [notebook, setNotebook] = useState<NotebookDetail | null>(null);
  const [messages, setMessages] = useState<NotebookMessage[]>([]);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getNotebook(id).then((nb) => {
      setNotebook(nb);
      setMessages(nb.messages);
      setSources(nb.sources);
      setTitleDraft(nb.title);
    });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    if (sources.length === 0) { setError(t("nb_sources_required", lang)); return; }

    setInput("");
    setError(null);
    setIsStreaming(true);
    setStreamingText("");

    // Optimistic user message
    const optimistic: NotebookMessage = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await chatNotebook(id, msg);
      if (!res.body) throw new Error("No response body");

      let full = "";
      for await (const event of parseSSE(res.body)) {
        if (event.type === "chunk") {
          full += event.text;
          setStreamingText(full);
        } else if (event.type === "error") {
          setError(event.message);
        }
      }

      if (full) {
        const aiMsg: NotebookMessage = {
          id: `ai-${Date.now()}`,
          role: "model",
          content: full,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("nb_error", lang));
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  }, [id, input, isStreaming, sources.length, lang]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const newSources = await uploadNotebookSources(id, files);
      setSources((prev) => [...prev, ...newSources]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    await deleteNotebookSource(id, sourceId);
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
  };

  const handleRenameSubmit = async () => {
    if (!titleDraft.trim()) return;
    setEditingTitle(false);
    await renameNotebook(id, titleDraft.trim());
    setNotebook((prev) => prev ? { ...prev, title: titleDraft.trim() } : prev);
  };

  const handleClearChat = async () => {
    if (!confirm(lang === "he" ? "למחוק את כל השיחה?" : "Clear the entire conversation?")) return;
    await clearNotebookChat(id);
    setMessages([]);
  };

  if (!notebook) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={() => router.push("/notebooks")}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") setEditingTitle(false); }}
            className="flex-1 rounded border px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <h1
            className="flex-1 cursor-pointer truncate font-semibold hover:opacity-70"
            onClick={() => setEditingTitle(true)}
            title={lang === "he" ? "לחץ לעריכה" : "Click to rename"}
          >
            {notebook.title}
          </h1>
        )}

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive"
          >
            {t("nb_clear_chat", lang)}
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* ── Sources panel ──────────────────────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">
              {t("nb_sources", lang)}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                {sources.length}
              </span>
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {t("nb_add_source", lang)}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {sources.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <FileText className="h-8 w-8 opacity-40" />
                <span className="font-medium">{t("nb_no_sources", lang)}</span>
                <span className="opacity-70">{t("nb_no_sources_hint", lang)}</span>
              </button>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((src, idx) => (
                  <li
                    key={src.id}
                    className="group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-xs shadow-sm"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium" title={src.original_name}>
                      {src.original_name}
                    </span>
                    <button
                      onClick={() => handleDeleteSource(src.id)}
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Chat panel ─────────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 && !isStreaming && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <BookOpen className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium text-foreground">
                  {lang === "he" ? "שאל כל שאלה על המסמכים שלך" : "Ask anything about your documents"}
                </p>
                <p className="max-w-sm text-xs">
                  {lang === "he"
                    ? "הבינה המלאכותית תנתח את המקורות ותספק תשובות עם ציטוטים מדויקים"
                    : "The AI will analyze your sources and provide answers with precise citations"}
                </p>
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} sources={sources} />
              ))}

              {/* Streaming response */}
              {isStreaming && (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {streamingText ? (
                      <div className="text-sm leading-relaxed">
                        {streamingText.split("\n").map((line, i) => (
                          <p key={i} className="mb-1 last:mb-0">
                            {renderWithCitations(line, sources)}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{t("nb_thinking", lang)}</p>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t bg-background px-6 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-3 rounded-xl border bg-muted/30 px-4 py-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("nb_chat_placeholder", lang)}
                  rows={1}
                  disabled={isStreaming}
                  className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                {lang === "he"
                  ? "Enter לשליחה · Shift+Enter לשורה חדשה"
                  : "Enter to send · Shift+Enter for new line"}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
