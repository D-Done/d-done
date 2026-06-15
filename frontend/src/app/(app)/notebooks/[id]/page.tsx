"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, FileText, Headphones, Loader2, MoreVertical,
  Plus, Send, Sparkles, X, MonitorPlay, BrainCircuit, Video,
  BookOpen, FileBarChart, HelpCircle, BarChart3, Table2, Newspaper,
  ChevronRight, Check, RotateCcw,
} from "lucide-react";
import {
  chatNotebook, clearNotebookChat, deleteNotebookSource,
  getNotebook, renameNotebook, uploadNotebookSources,
} from "@/lib/api";
import type { NotebookDetail, NotebookSource } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type StudioType =
  | "presentation" | "audio" | "mindmap" | "video"
  | "flashcards" | "report" | "quiz" | "infographic" | "datatable";

interface UserMsg  { kind: "user";   id: string; content: string }
interface AiMsg    { kind: "ai";     id: string; content: string }
interface StudioMsg {
  kind: "studio"; id: string; studioType: StudioType;
  loading: boolean; data: unknown; raw: string;
}
type Entry = UserMsg | AiMsg | StudioMsg;

interface Slide       { title: string; points: string[]; notes?: string }
interface Flashcard   { front: string; back: string }
interface QuizQ       { question: string; options: string[]; correct: number; explanation: string }
interface MapBranch   { name: string; subs: string[] }
interface IFact       { icon: string; title: string; value: string; desc: string }
interface DataTable   { title: string; headers: string[]; rows: string[][] }

// ─────────────────────────────────────────────────────────────
// Studio config
// ─────────────────────────────────────────────────────────────

const STUDIO: {
  type: StudioType; label: string; Icon: React.ComponentType<{ className?: string }>;
  color: string; format: "json" | "md"; prompt: string;
}[] = [
  {
    type: "presentation", label: "Presentation", Icon: MonitorPlay, color: "#5B9BD5", format: "json",
    prompt: `Create a slide presentation. Return ONLY a JSON object (no extra text):
{"slides":[{"title":"string","points":["string"],"notes":"string"}]}
Make 7-9 slides covering all key topics from the sources.`,
  },
  {
    type: "audio", label: "Audio Overview", Icon: Headphones, color: "#E8711A", format: "md",
    prompt: `Write a podcast-style conversation between two hosts (Host A and Host B) about the documents.
Format: **Host A:** [dialogue]\n**Host B:** [response]. About 800-1000 words, conversational and insightful.`,
  },
  {
    type: "mindmap", label: "Mind Map", Icon: BrainCircuit, color: "#6AA84F", format: "json",
    prompt: `Create a mind map. Return ONLY a JSON object:
{"center":"main topic","branches":[{"name":"branch","subs":["sub1","sub2"]}]}
Include 5-7 main branches with 3-4 subtopics each.`,
  },
  {
    type: "video", label: "Video Script", Icon: Video, color: "#CC0000", format: "md",
    prompt: `Write a narrated video script (2-3 min). Format each scene as:
## Scene N: Title (Xs)
**On screen:** [visuals]
**Narration:** [exact words]
Write 6-8 scenes.`,
  },
  {
    type: "flashcards", label: "Flashcards", Icon: BookOpen, color: "#7B68EE", format: "json",
    prompt: `Create flashcards. Return ONLY a JSON object:
{"cards":[{"front":"question or concept","back":"answer or explanation"}]}
Create 15 flashcards covering all key concepts.`,
  },
  {
    type: "report", label: "Report", Icon: FileBarChart, color: "#00BCD4", format: "md",
    prompt: `Write a comprehensive professional report with: Executive Summary, Key Findings, Detailed Analysis, Conclusions, Recommendations. Use markdown headers (##) and bullet points.`,
  },
  {
    type: "quiz", label: "Quiz", Icon: HelpCircle, color: "#FF6B6B", format: "json",
    prompt: `Create a multiple-choice quiz. Return ONLY a JSON object:
{"questions":[{"question":"string","options":["A","B","C","D"],"correct":0,"explanation":"string"}]}
Create 10 questions. "correct" is the 0-based index of the correct answer.`,
  },
  {
    type: "infographic", label: "Infographic", Icon: BarChart3, color: "#F4A261", format: "json",
    prompt: `Extract key facts for an infographic. Return ONLY a JSON object:
{"title":"string","facts":[{"icon":"emoji","title":"short title","value":"key stat/value","desc":"one sentence"}]}
Extract 8 compelling facts or statistics.`,
  },
  {
    type: "datatable", label: "Data Table", Icon: Table2, color: "#4CAF50", format: "json",
    prompt: `Extract structured data into a table. Return ONLY a JSON object:
{"title":"string","headers":["col1","col2"],"rows":[["val1","val2"]]}
Extract all quantitative data, parties, dates, or structured comparisons.`,
  },
];

// ─────────────────────────────────────────────────────────────
// SSE parser
// ─────────────────────────────────────────────────────────────
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
        if (raw) { try { yield JSON.parse(raw); } catch { /**/ } }
      }
    }
  }
}

function tryParseJSON(text: string): unknown {
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch { /**/ } }
  try { return JSON.parse(text); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// Citation rendering
// ─────────────────────────────────────────────────────────────
function WithCitations({ text, sources }: { text: string; sources: NotebookSource[] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (m) {
          const n = parseInt(m[1], 10);
          return (
            <sup key={i} title={sources[n - 1]?.original_name}
              className="mx-0.5 inline-flex h-[14px] min-w-[14px] cursor-default items-center justify-center rounded-full bg-[#1A8C52] px-0.5 text-[9px] font-bold text-white">
              {n}
            </sup>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Studio renderers
// ─────────────────────────────────────────────────────────────

function PresentationRenderer({ data }: { data: { slides: Slide[] } }) {
  const [idx, setIdx] = useState(0);
  const slides = data.slides ?? [];
  const slide = slides[idx];
  if (!slide) return null;
  return (
    <div className="rounded-xl bg-[#1A1A1E] overflow-hidden">
      <div className="bg-[#2C2C2E] px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-[#8E8E93]">Presentation · {slides.length} slides</span>
        <span className="text-xs text-[#8E8E93]">{idx + 1} / {slides.length}</span>
      </div>
      <div className="p-6 min-h-[200px]">
        <h3 className="text-lg font-bold text-white mb-4">{slide.title}</h3>
        <ul className="space-y-2">
          {slide.points?.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#C7C7CC]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1A8C52]" />
              {pt}
            </li>
          ))}
        </ul>
        {slide.notes && <p className="mt-4 text-xs text-[#636366] italic">{slide.notes}</p>}
      </div>
      <div className="border-t border-[#2C2C2E] px-4 py-2 flex justify-between">
        <button disabled={idx === 0} onClick={() => setIdx(i => i - 1)}
          className="flex items-center gap-1 text-xs text-[#1A8C52] disabled:opacity-30">
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <button disabled={idx === slides.length - 1} onClick={() => setIdx(i => i + 1)}
          className="flex items-center gap-1 text-xs text-[#1A8C52] disabled:opacity-30">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FlashcardsRenderer({ data }: { data: { cards: Flashcard[] } }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const cards = data.cards ?? [];
  const card = cards[idx];
  if (!card) return null;
  return (
    <div className="rounded-xl bg-[#1A1A1E] overflow-hidden">
      <div className="bg-[#2C2C2E] px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-[#8E8E93]">Flashcards · {cards.length} cards</span>
        <span className="text-xs text-[#8E8E93]">{idx + 1} / {cards.length}</span>
      </div>
      <div
        className="mx-4 my-4 cursor-pointer rounded-xl border border-[#3A3A3C] bg-[#2C2C2E] p-8 text-center transition-all hover:border-[#1A8C52]"
        onClick={() => setFlipped(f => !f)}
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#636366] mb-3">
          {flipped ? "Answer" : "Question"} · click to flip
        </p>
        <p className="text-[15px] text-white leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
      </div>
      <div className="border-t border-[#2C2C2E] px-4 py-2 flex justify-between items-center">
        <button disabled={idx === 0} onClick={() => { setIdx(i => i - 1); setFlipped(false); }}
          className="flex items-center gap-1 text-xs text-[#1A8C52] disabled:opacity-30">
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <button onClick={() => setFlipped(f => !f)}
          className="flex items-center gap-1 text-xs text-[#8E8E93] hover:text-white">
          <RotateCcw className="h-3 w-3" /> Flip
        </button>
        <button disabled={idx === cards.length - 1} onClick={() => { setIdx(i => i + 1); setFlipped(false); }}
          className="flex items-center gap-1 text-xs text-[#1A8C52] disabled:opacity-30">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function QuizRenderer({ data }: { data: { questions: QuizQ[] } }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const qs = data.questions ?? [];
  const q = qs[idx];

  if (done || !q) {
    return (
      <div className="rounded-xl bg-[#1A1A1E] p-8 text-center">
        <p className="text-2xl font-bold text-white">{score} / {qs.length}</p>
        <p className="text-sm text-[#8E8E93] mt-1">Quiz complete!</p>
        <button onClick={() => { setIdx(0); setSelected(null); setScore(0); setDone(false); }}
          className="mt-4 rounded-lg bg-[#1A8C52] px-4 py-2 text-sm text-white hover:bg-[#157A44]">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1A1A1E] overflow-hidden">
      <div className="bg-[#2C2C2E] px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs text-[#8E8E93]">Quiz · {qs.length} questions</span>
        <span className="text-xs text-[#8E8E93]">{idx + 1} / {qs.length} · Score: {score}</span>
      </div>
      <div className="p-5">
        <p className="text-[14px] font-medium text-white mb-4">{q.question}</p>
        <div className="space-y-2">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correct;
            const isSelected = selected === i;
            let cls = "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ";
            if (selected === null) cls += "border-[#3A3A3C] text-[#C7C7CC] hover:border-[#1A8C52] hover:text-white";
            else if (isCorrect) cls += "border-[#1A8C52] bg-[#1A8C52]/10 text-[#1A8C52]";
            else if (isSelected) cls += "border-red-500/50 bg-red-500/10 text-red-400";
            else cls += "border-[#3A3A3C] text-[#636366]";
            return (
              <button key={i} disabled={selected !== null} className={cls}
                onClick={() => { setSelected(i); if (isCorrect) setScore(s => s + 1); }}>
                <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span> {opt}
                {selected !== null && isCorrect && <Check className="ml-2 inline h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
        {selected !== null && (
          <p className="mt-3 text-xs text-[#8E8E93] italic">{q.explanation}</p>
        )}
        {selected !== null && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => { setSelected(null); if (idx < qs.length - 1) setIdx(i => i + 1); else setDone(true); }}
              className="rounded-lg bg-[#1A8C52] px-4 py-2 text-sm text-white hover:bg-[#157A44]">
              {idx < qs.length - 1 ? "Next question →" : "Finish"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MindMapRenderer({ data }: { data: { center: string; branches: MapBranch[] } }) {
  return (
    <div className="rounded-xl bg-[#1A1A1E] p-5">
      <div className="mb-4 text-center">
        <span className="inline-block rounded-full bg-[#1A8C52] px-4 py-2 text-sm font-bold text-white">
          {data.center}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.branches?.map((branch, i) => (
          <div key={i} className="rounded-lg border border-[#3A3A3C] bg-[#2C2C2E] p-3">
            <p className="mb-2 text-[13px] font-semibold text-white">{branch.name}</p>
            <ul className="space-y-1">
              {branch.subs?.map((sub, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-[#8E8E93]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#1A8C52]" />{sub}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfographicRenderer({ data }: { data: { title: string; facts: IFact[] } }) {
  return (
    <div className="rounded-xl bg-[#1A1A1E] p-5">
      <p className="mb-4 text-center text-[13px] font-bold text-white">{data.title}</p>
      <div className="grid grid-cols-2 gap-3">
        {data.facts?.map((f, i) => (
          <div key={i} className="rounded-xl border border-[#3A3A3C] bg-[#2C2C2E] p-3">
            <div className="text-2xl mb-1">{f.icon}</div>
            <p className="text-lg font-bold text-[#1A8C52] leading-none">{f.value}</p>
            <p className="text-[12px] font-medium text-white mt-1">{f.title}</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTableRenderer({ data }: { data: DataTable }) {
  return (
    <div className="rounded-xl bg-[#1A1A1E] overflow-hidden">
      <div className="bg-[#2C2C2E] px-4 py-2.5">
        <span className="text-sm font-semibold text-white">{data.title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#3A3A3C]">
              {data.headers?.map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows?.map((row, i) => (
              <tr key={i} className="border-b border-[#2C2C2E] hover:bg-[#2C2C2E]/50">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-[13px] text-[#C7C7CC]">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkdownRenderer({ text, sources }: { text: string; sources: NotebookSource[] }) {
  return (
    <div className="rounded-xl bg-[#1A1A1E] p-5 text-[13.5px] leading-relaxed text-[#C7C7CC] space-y-2">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i} className="text-[15px] font-bold text-white mt-3 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith("# "))  return <h2 key={i} className="text-[16px] font-bold text-white mt-3 mb-1">{line.slice(2)}</h2>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-white">{line.slice(2, -2)}</p>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1A8C52]" />
              <p><WithCitations text={line.slice(2)} sources={sources} /></p>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}><WithCitations text={line} sources={sources} /></p>;
      })}
    </div>
  );
}

function StudioArtifact({ entry, sources }: { entry: StudioMsg; sources: NotebookSource[] }) {
  const cfg = STUDIO.find(s => s.type === entry.studioType);
  if (entry.loading) {
    return (
      <div className="flex gap-3 px-4">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: cfg?.color + "22" }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: cfg?.color }} />
        </div>
        <div className="flex-1">
          <p className="text-[12px] text-[#8E8E93] mb-2">Generating {cfg?.label}…</p>
          <div className="h-24 rounded-xl bg-[#2C2C2E] animate-pulse" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 px-4">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: cfg?.color + "22" }}>
        {cfg && <cfg.Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[#8E8E93] mb-2">{cfg?.label}</p>
        {entry.studioType === "presentation"  && <PresentationRenderer data={entry.data as { slides: Slide[] }} />}
        {entry.studioType === "flashcards"    && <FlashcardsRenderer   data={entry.data as { cards: Flashcard[] }} />}
        {entry.studioType === "quiz"          && <QuizRenderer         data={entry.data as { questions: QuizQ[] }} />}
        {entry.studioType === "mindmap"       && <MindMapRenderer      data={entry.data as { center: string; branches: MapBranch[] }} />}
        {entry.studioType === "infographic"   && <InfographicRenderer  data={entry.data as { title: string; facts: IFact[] }} />}
        {entry.studioType === "datatable"     && <DataTableRenderer    data={entry.data as DataTable} />}
        {["audio","video","report"].includes(entry.studioType) && <MarkdownRenderer text={entry.raw} sources={sources} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [notebook, setNotebook] = useState<NotebookDetail | null>(null);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getNotebook(id).then(nb => {
      setNotebook(nb);
      setSources(nb.sources);
      setTitleDraft(nb.title);
      setEntries(nb.messages.map(m => ({
        kind: m.role === "user" ? "user" : "ai",
        id: m.id,
        content: m.content,
      } as Entry)));
    });
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries, streamingText]);

  // ── Regular chat send ─────────────────────────────────────
  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;
    if (!sources.length) { setError("Add at least one source before chatting."); return; }
    setInput(""); setError(null); setIsStreaming(true); setStreamingText("");
    setEntries(prev => [...prev, { kind: "user", id: `u-${Date.now()}`, content: msg }]);
    try {
      const res = await chatNotebook(id, msg);
      if (!res.body) throw new Error("No response body");
      let full = "";
      for await (const ev of parseSSE(res.body)) {
        if (ev.type === "chunk") { full += ev.text; setStreamingText(full); }
        else if (ev.type === "error") setError(ev.message);
      }
      if (full) setEntries(prev => [...prev, { kind: "ai", id: `a-${Date.now()}`, content: full }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setIsStreaming(false); setStreamingText(""); }
  }, [id, input, isStreaming, sources.length]);

  // ── Studio generate ───────────────────────────────────────
  const handleStudio = useCallback(async (type: StudioType) => {
    if (!sources.length) { setError("Add at least one source first."); return; }
    const cfg = STUDIO.find(s => s.type === type)!;
    const artifactId = `studio-${Date.now()}`;
    const placeholder: StudioMsg = { kind: "studio", id: artifactId, studioType: type, loading: true, data: null, raw: "" };
    setEntries(prev => [...prev, placeholder]);
    setError(null);
    try {
      const res = await chatNotebook(id, cfg.prompt);
      if (!res.body) throw new Error("No response body");
      let full = "";
      for await (const ev of parseSSE(res.body)) {
        if (ev.type === "chunk") full += ev.text;
        else if (ev.type === "error") setError(ev.message);
      }
      const parsed = cfg.format === "json" ? tryParseJSON(full) : null;
      setEntries(prev => prev.map(e =>
        e.id === artifactId
          ? { ...e, loading: false, data: parsed ?? {}, raw: full } as StudioMsg
          : e
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Studio error");
      setEntries(prev => prev.filter(e => e.id !== artifactId));
    }
  }, [id, sources.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ns = await uploadNotebookSources(id, files);
      setSources(prev => [...prev, ...ns]);
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleRenameSubmit = async () => {
    if (!titleDraft.trim()) return;
    setEditingTitle(false);
    await renameNotebook(id, titleDraft.trim());
    setNotebook(prev => prev ? { ...prev, title: titleDraft.trim() } : prev);
  };

  if (!notebook) return (
    <div className="flex h-full items-center justify-center bg-[#111113]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1A8C52] border-t-transparent" />
    </div>
  );

  const hasMessages = entries.length > 0 || isStreaming;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-[#111113] text-[#F2F2F7]">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-[#2C2C2E] bg-[#111113] px-4 py-2.5">
        <button onClick={() => router.push("/notebooks")}
          className="rounded-md p-1.5 text-[#8E8E93] hover:bg-[#2C2C2E] hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {editingTitle ? (
          <input autoFocus value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") setEditingTitle(false); }}
            className="flex-1 rounded-lg border border-[#1A8C52] bg-[#2C2C2E] px-3 py-1 text-sm font-medium text-white outline-none" />
        ) : (
          <h1 className="flex-1 cursor-pointer truncate text-sm font-semibold hover:opacity-70"
            onClick={() => setEditingTitle(true)}>
            {notebook.title}
          </h1>
        )}
        {hasMessages && (
          <button onClick={async () => {
            if (!confirm("Clear conversation?")) return;
            await clearNotebookChat(id);
            setEntries([]);
          }} className="text-xs text-[#8E8E93] hover:text-white px-2 py-1 rounded">
            Clear
          </button>
        )}
        <button className="rounded-md p-1.5 text-[#8E8E93] hover:bg-[#2C2C2E]">
          <MoreVertical className="h-4 w-4" />
        </button>
      </header>

      {/* ── Three panels ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── LEFT: Studio ────────────────────────────────────── */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#2C2C2E] bg-[#1C1C1E]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2C2C2E]">
            <span className="text-[13px] font-semibold text-[#F2F2F7]">Studio</span>
            <Sparkles className="h-4 w-4 text-[#8E8E93]" />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              {STUDIO.map(cfg => (
                <button key={cfg.type}
                  onClick={() => handleStudio(cfg.type)}
                  disabled={!sources.length}
                  className="group flex flex-col items-start gap-2 rounded-xl bg-[#2C2C2E] px-3 py-3 text-left transition-all hover:bg-[#3A3A3C] disabled:opacity-40">
                  <cfg.Icon className="h-4 w-4" style={{ color: cfg.color }} />
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[11.5px] font-medium text-[#F2F2F7] leading-tight">{cfg.label}</span>
                    <ChevronLeft className="h-3 w-3 text-[#636366] group-hover:text-[#8E8E93]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-[#2C2C2E] p-3">
            <p className="text-[10.5px] text-[#636366] leading-relaxed">
              Studio content is generated from your sources. Click any format to generate.
            </p>
          </div>
        </aside>

        {/* ── CENTER: Chat ─────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#111113]">
          <div className="flex-1 overflow-y-auto py-6">
            {!hasMessages ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-6">
                <div className="text-5xl">👋</div>
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Let&apos;s start building your notebook...
                  </h2>
                  <p className="text-sm text-[#8E8E93]">
                    {sources.length === 0
                      ? "Add sources on the right to get started"
                      : `Grounded in ${sources.length} source${sources.length > 1 ? "s" : ""}`}
                  </p>
                </div>
                {sources.length > 0 && (
                  <div>
                    <p className="text-sm text-[#8E8E93] mb-3">What would you like to do?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {["Summarize all sources", "What are the key risks?", "List important dates and parties", "Create a timeline of events"].map(q => (
                        <button key={q} onClick={() => handleSend(q)}
                          className="rounded-full border border-[#3A3A3C] px-4 py-2 text-sm text-[#C7C7CC] hover:border-[#1A8C52] hover:text-white transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-6">
                {entries.map(entry => {
                  if (entry.kind === "user") {
                    return (
                      <div key={entry.id} className="flex justify-end px-4">
                        <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-[#2C2C2E] px-4 py-3 text-[13.5px] text-[#F2F2F7]">
                          {entry.content}
                        </div>
                      </div>
                    );
                  }
                  if (entry.kind === "studio") {
                    return <StudioArtifact key={entry.id} entry={entry} sources={sources} />;
                  }
                  // AI message
                  const cited = Array.from(new Set(
                    [...entry.content.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10))
                  )).filter(n => n >= 1 && n <= sources.length);
                  return (
                    <div key={entry.id} className="flex gap-3 px-4">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A8C52]/20">
                        <Sparkles className="h-3.5 w-3.5 text-[#1A8C52]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] leading-relaxed text-[#C7C7CC]">
                          {entry.content.split("\n").map((line, i) => (
                            <p key={i} className="mb-1 last:mb-0">
                              <WithCitations text={line} sources={sources} />
                            </p>
                          ))}
                        </div>
                        {cited.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {cited.map(n => (
                              <span key={n} className="flex items-center gap-1.5 rounded-full bg-[#2C2C2E] px-2.5 py-0.5 text-[11px] text-[#8E8E93]">
                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1A8C52] text-[8px] font-bold text-white">{n}</span>
                                <span className="max-w-[120px] truncate">{sources[n - 1]?.original_name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className="flex gap-3 px-4">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A8C52]/20">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1A8C52]" />
                    </div>
                    <div className="text-[13.5px] leading-relaxed text-[#C7C7CC]">
                      {streamingText
                        ? streamingText.split("\n").map((l, i) => <p key={i} className="mb-1 last:mb-0"><WithCitations text={l} sources={sources} /></p>)
                        : <span className="text-[#636366] italic">Analyzing sources…</span>}
                    </div>
                  </div>
                )}
                {error && (
                  <div className="mx-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">{error}</div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-[#2C2C2E] bg-[#111113] px-6 py-4">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-end gap-3 rounded-2xl border border-[#3A3A3C] bg-[#1C1C1E] px-4 py-3 focus-within:border-[#1A8C52]/60">
                <button onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#3A3A3C] px-2.5 py-1.5 text-[11px] text-[#8E8E93] hover:text-white hover:border-[#636366]">
                  <ChevronLeft className="h-3 w-3" />
                  <span>{sources.length} sources</span>
                </button>
                <textarea ref={textareaRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }}
                  placeholder="Ask a question or create something"
                  rows={1} disabled={isStreaming}
                  className="max-h-40 flex-1 resize-none bg-transparent text-[13.5px] text-[#F2F2F7] outline-none placeholder:text-[#636366] disabled:opacity-50" />
                <button onClick={() => handleSend()} disabled={!input.trim() || isStreaming}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1A8C52] text-white disabled:opacity-30 hover:bg-[#157A44]">
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1 text-center text-[10.5px] text-[#636366]">
                NotebookLM responses may be inaccurate — always verify with original sources.
              </p>
            </div>
          </div>
        </main>

        {/* ── RIGHT: Sources ───────────────────────────────────── */}
        <aside className="flex w-[260px] shrink-0 flex-col border-l border-[#2C2C2E] bg-[#1C1C1E]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2C2C2E]">
            <span className="text-[13px] font-semibold text-[#F2F2F7]">Sources</span>
            <FileText className="h-4 w-4 text-[#8E8E93]" />
          </div>

          <div className="p-3 border-b border-[#2C2C2E]">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#3A3A3C] py-2.5 text-[12.5px] font-medium text-[#F2F2F7] hover:border-[#1A8C52] hover:text-[#1A8C52] transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add source
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {sources.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-3 text-center px-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2C2C2E]">
                  <FileText className="h-6 w-6 text-[#636366]" />
                </div>
                <p className="text-[11.5px] text-[#8E8E93] leading-relaxed">
                  Sources will appear here. Click &quot;Add source&quot; to upload PDFs.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((src, i) => {
                  const colors = ["#4285F4","#EA4335","#FBBC04","#34A853","#9C27B0","#FF6D00"];
                  const color = colors[i % colors.length];
                  return (
                    <li key={src.id} className="group flex items-center gap-2.5 rounded-xl bg-[#2C2C2E] px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white"
                        style={{ backgroundColor: color }}>
                        PDF
                      </div>
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#F2F2F7]" title={src.original_name}>
                        {src.original_name}
                      </p>
                      <button onClick={() => deleteNotebookSource(notebook.id, src.id).then(() =>
                        setSources(prev => prev.filter(s => s.id !== src.id))
                      )} className="shrink-0 opacity-0 group-hover:opacity-100 text-[#636366] hover:text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
