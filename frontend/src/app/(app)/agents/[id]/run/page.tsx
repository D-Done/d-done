"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { getAgent, listProjects, runAgent, runAgentUpload, exportAgentOutput } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { CustomAgent, ProjectListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "project" | "upload";
type Phase = "setup" | "running" | "done";

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
        const data = line.slice(6).trim();
        if (data) {
          try { yield JSON.parse(data); } catch { /* ignore */ }
        }
      }
    }
  }
}

function AgentMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-3 ms-5 space-y-1 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ms-5 space-y-1 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mb-1.5 mt-3 first:mt-0">{children}</h3>,
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-[13px] font-mono">{children}</pre>
        ),
        hr: () => <hr className="my-4 border-border" />,
        blockquote: ({ children }) => (
          <blockquote className="border-s-2 border-muted-foreground/40 ps-3 italic text-muted-foreground my-3">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted px-3 py-2 text-start font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-3 py-2">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function RunAgentPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useLanguage();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<CustomAgent | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [mode, setMode] = useState<Mode>("project");
  const [selectedProject, setSelectedProject] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"docx" | "xlsx" | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAgent(agentId).then(setAgent).catch(() => router.push("/agents"));
    listProjects().then(setProjects).catch(() => {});
  }, [agentId, router]);

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result]);

  const handleRun = useCallback(async () => {
    if (mode === "project" && !selectedProject) {
      setError(t("run_no_project", lang));
      return;
    }
    if (mode === "upload" && !uploadedFiles.length) {
      setError(t("run_no_files", lang));
      return;
    }

    setPhase("running");
    setResult("");
    setError(null);

    try {
      const res =
        mode === "project"
          ? await runAgent(agentId, selectedProject)
          : await runAgentUpload(agentId, uploadedFiles);

      if (!res.body) throw new Error("No response body");

      for await (const event of parseSSE(res.body)) {
        if (event.type === "chunk") setResult((p) => p + event.text);
        else if (event.type === "error") { setError(event.message); break; }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("run_error", lang));
    } finally {
      setPhase("done");
    }
  }, [agentId, mode, selectedProject, uploadedFiles, lang]);

  const handleDownload = async (format: "docx" | "xlsx") => {
    setExporting(format);
    try {
      const blob = await exportAgentOutput(agentId, result, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agent?.name ?? "output"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setExporting(null); }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadedFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const reset = () => {
    setPhase("setup");
    setResult("");
    setError(null);
    setUploadedFiles([]);
    setSelectedProject("");
  };

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground">
        <Link href="/agents" className="flex items-center gap-1 hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          {t("agents_back", lang)}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{agent.name}</span>
      </div>

      {/* Body — two-column on result, single-column on setup */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel — setup / controls */}
        <div className={`flex flex-col border-e ${phase !== "setup" ? "w-72 shrink-0" : "flex-1"}`}>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div>
              <h1 className="text-lg font-bold">{t("run_dialog_title", lang)}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{agent.description}</p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              <button
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "project" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("project")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t("run_tab_project", lang)}
              </button>
              <button
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "upload" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("upload")}
              >
                <Upload className="h-3.5 w-3.5" />
                {t("run_tab_upload", lang)}
              </button>
            </div>

            {/* Project selector */}
            {mode === "project" && (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder={t("run_select_project", lang)} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Upload area */}
            {mode === "upload" && (
              <div className="space-y-3">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload className="h-6 w-6" />
                  <span>{t("run_upload_hint", lang)}</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                />
                {uploadedFiles.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {uploadedFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
                        <span className="truncate">{f.name}</span>
                        <button
                          onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t px-6 py-4 flex items-center justify-between gap-2">
            {phase === "done" ? (
              <button
                onClick={reset}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("run_again", lang)}
              </button>
            ) : <div />}
            <div className="flex gap-2">
              {phase === "done" && (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleDownload("docx")} disabled={!!exporting} className="gap-1.5 text-xs">
                    {exporting === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Word
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownload("xlsx")} disabled={!!exporting} className="gap-1.5 text-xs">
                    {exporting === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                    Excel
                  </Button>
                </>
              )}
              {phase === "setup" && (
                <Button onClick={handleRun} className="w-full">
                  {t("run_submit", lang)}
                </Button>
              )}
              {phase === "running" && (
                <Button disabled>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("run_submit", lang)}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — results (only shown when running/done) */}
        {phase !== "setup" && (
          <div ref={resultRef} className="flex-1 overflow-y-auto px-8 py-6 text-sm leading-relaxed">
            {result ? (
              <AgentMarkdown content={result} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {phase === "running" && result && (
              <span className="inline-block h-4 w-1 animate-pulse bg-primary mt-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
