"use client";

import {
  useCallback, useEffect, useRef, useState, use,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronDown, FileText, Headphones, Loader2,
  MoreVertical, Plus, Send, Sparkles, Trash2, X, BookOpen,
  AlignLeft, HelpCircle, Clock, List,
} from "lucide-react";
import {
  chatNotebook, clearNotebookChat, deleteNotebookSource,
  getNotebook, renameNotebook, uploadNotebookSources,
} from "@/lib/api";
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
          className="mx-0.5 inline-flex h-[14px] min-w-[14px] cursor-default items-center justify-center rounded-full bg-[#1E6B52] px-0.5 text-[9px] font-semibold text-white"
        >
          {num}
        </sup>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Source card ─────────────────────────────────────────────────────────────
function SourceCard({
  source, index, onDelete,
}: { source: NotebookSource; index: number; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ext = source.original_name.split(".").pop()?.toUpperCase() ?? "PDF";
  const colors = ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#9C27B0", "#FF6D00"];
  const color = colors[index % colors.length];

  return (
    <div className="group relative flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {ext}
      </div>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800" title={source.original_name}>
        {source.original_name}
      </p>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded p-0.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/10">
            <button
              onClick={() => { onDelete(); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove source
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message ─────────────────────────────────────────────────────────────────
function ChatMessage({ msg, sources }: { msg: NotebookMessage; sources: NotebookSource[] }) {
  const cited = Array.from(new Set(
    [...msg.content.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10))
  )).filter((n) => n >= 1 && n <= sources.length);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end px-6">
        <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-[#1E6B52] px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E8F5E9]">
          <Sparkles className="h-3.5 w-3.5 text-[#1E6B52]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-relaxed text-gray-800">
            {msg.content.split("\n").map((line, i) => (
              <p key={i} className="mb-1 last:mb-0">
                {renderWithCitations(line, sources)}
              </p>
            ))}
          </div>
          {cited.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {cited.map((n) => (
                <div
                  key={n}
                  className="flex items-center gap-1.5 rounded-full bg-[#F0F4F9] px-3 py-1 text-[11px] font-medium text-[#3C4043]"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1E6B52] text-[8px] font-bold text-white">
                    {n}
                  </span>
                  <span className="max-w-[140px] truncate">{sources[n - 1]?.original_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Suggested questions ─────────────────────────────────────────────────────
const SUGGESTED = [
  "Summarize the key points of all documents",
  "What are the main risks or concerns?",
  "List the most important dates and deadlines",
  "Who are the parties involved and what are their obligations?",
];

// ── Main page ───────────────────────────────────────────────────────────────
export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;
    if (sources.length === 0) { setError("Add at least one source document before chatting."); return; }

    setInput("");
    setError(null);
    setIsStreaming(true);
    setStreamingText("");

    const optimistic: NotebookMessage = {
      id: `opt-${Date.now()}`, role: "user", content: msg, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await chatNotebook(id, msg);
      if (!res.body) throw new Error("No response body");
      let full = "";
      for await (const event of parseSSE(res.body)) {
        if (event.type === "chunk") { full += event.text; setStreamingText(full); }
        else if (event.type === "error") setError(event.message);
      }
      if (full) {
        setMessages((prev) => [...prev, {
          id: `ai-${Date.now()}`, role: "model", content: full, created_at: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  }, [id, input, isStreaming, sources.length]);

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
    if (!confirm("Clear the entire conversation?")) return;
    await clearNotebookChat(id);
    setMessages([]);
  };

  if (!notebook) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FFFBF6]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1E6B52] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-[#FFFBF6]">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 border-b border-[#E8DDD4] bg-[#FFFBF6] px-4 py-2.5">
        <button
          onClick={() => router.push("/notebooks")}
          className="rounded-md p-1.5 text-gray-500 hover:bg-[#F0E9DE] hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="flex-1 rounded-lg border border-[#1E6B52] bg-white px-3 py-1 text-sm font-medium outline-none"
          />
        ) : (
          <h1
            className="flex-1 cursor-pointer truncate text-sm font-semibold text-gray-800 hover:opacity-70"
            onClick={() => setEditingTitle(true)}
          >
            {notebook.title}
          </h1>
        )}

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-[#F0E9DE]"
          >
            Clear chat
          </button>
        )}
        <button className="rounded-md p-1.5 text-gray-500 hover:bg-[#F0E9DE]">
          <MoreVertical className="h-4 w-4" />
        </button>
      </header>

      {/* ── Three panels ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── LEFT: Sources ──────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-[#E8DDD4] bg-[#F5EFE8]">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[13px] font-semibold text-gray-700">
              Sources
              <span className="ml-1.5 text-gray-400">{sources.length}</span>
            </h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add source
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />

          <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {sources.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#C8BAA8] bg-white/60 py-10 text-center transition-colors hover:border-[#1E6B52] hover:bg-white"
              >
                <FileText className="h-8 w-8 text-[#C8BAA8]" />
                <div>
                  <p className="text-[13px] font-medium text-gray-600">Upload sources</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">PDF files supported</p>
                </div>
              </button>
            ) : (
              sources.map((src, i) => (
                <SourceCard key={src.id} source={src} index={i} onDelete={() => handleDeleteSource(src.id)} />
              ))
            )}
          </div>
        </aside>

        {/* ── CENTER: Chat ────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#FFFBF6]">
          <div className="flex-1 overflow-y-auto py-6">
            <div className="mx-auto max-w-2xl space-y-6">

              {messages.length === 0 && !isStreaming && (
                <div className="px-6">
                  <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F5E9]">
                      <Sparkles className="h-7 w-7 text-[#1E6B52]" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      {sources.length === 0
                        ? "Add sources to get started"
                        : "What would you like to know?"}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {sources.length === 0
                        ? "Upload PDFs on the left to start chatting"
                        : `Grounded in ${sources.length} source${sources.length > 1 ? "s" : ""}`}
                    </p>
                  </div>

                  {sources.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {SUGGESTED.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="rounded-xl border border-[#E8DDD4] bg-white px-3 py-3 text-left text-[12.5px] text-gray-700 shadow-sm transition-all hover:border-[#1E6B52] hover:shadow-md"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} sources={sources} />
              ))}

              {isStreaming && (
                <div className="px-6">
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E8F5E9]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E6B52]" />
                    </div>
                    <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-gray-800">
                      {streamingText ? (
                        streamingText.split("\n").map((line, i) => (
                          <p key={i} className="mb-1 last:mb-0">
                            {renderWithCitations(line, sources)}
                          </p>
                        ))
                      ) : (
                        <span className="text-gray-400 italic">Analyzing sources…</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mx-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-[#E8DDD4] bg-[#FFFBF6] px-6 py-4">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-end gap-3 rounded-2xl border border-[#D4C9BC] bg-white px-4 py-3 shadow-sm focus-within:border-[#1E6B52] focus-within:ring-2 focus-within:ring-[#1E6B52]/10">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); }}
                  onKeyDown={handleKeyDown}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                  placeholder="Ask a question about your sources…"
                  rows={1}
                  disabled={isStreaming}
                  className="max-h-40 flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isStreaming}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E6B52] text-white shadow-sm transition-all hover:bg-[#185C46] disabled:opacity-30"
                >
                  {isStreaming
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-gray-400">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </main>

        {/* ── RIGHT: Studio ───────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#E8DDD4] bg-[#F5EFE8] p-4">
          <h2 className="text-[13px] font-semibold text-gray-700">Studio</h2>

          {/* Audio Overview card */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF3E0]">
                <Headphones className="h-4 w-4 text-[#E65100]" />
              </div>
              <span className="text-[13px] font-semibold text-gray-800">Audio Overview</span>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-gray-500">
              Two AI hosts discuss your sources in a podcast‑style conversation.
            </p>
            <div className="mb-3 flex items-center justify-center gap-4 rounded-xl bg-[#FFF8F0] py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFE0B2] text-sm font-bold text-[#E65100]">A</div>
              <div className="flex gap-0.5">
                {[3,5,4,6,3,5,2,4,6,3].map((h, i) => (
                  <div key={i} className="w-1 rounded-full bg-[#E65100]/40" style={{ height: `${h * 3}px` }} />
                ))}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFE0B2] text-sm font-bold text-[#E65100]">B</div>
            </div>
            <button
              onClick={() => alert("Audio Overview coming soon!")}
              className="w-full rounded-xl bg-[#E65100] py-2 text-[12.5px] font-semibold text-white hover:bg-[#BF360C]"
            >
              Generate
            </button>
          </div>

          {/* Preset formats */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="mb-3 text-[12px] font-semibold text-gray-700">Generate</p>
            <div className="space-y-1.5">
              {[
                { icon: AlignLeft, label: "Briefing doc" },
                { icon: BookOpen, label: "Study guide" },
                { icon: HelpCircle, label: "FAQ" },
                { icon: Clock, label: "Timeline" },
                { icon: List, label: "Table of contents" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => handleSend(`Create a ${label.toLowerCase()} based on all the sources`)}
                  disabled={sources.length === 0 || isStreaming}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-gray-700 transition-colors hover:bg-[#F5EFE8] disabled:opacity-40"
                >
                  <Icon className="h-3.5 w-3.5 text-[#1E6B52]" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
