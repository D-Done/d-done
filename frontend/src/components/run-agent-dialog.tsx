"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Upload, FolderOpen, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listProjects, runAgent, runAgentUpload, exportAgentOutput } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { ProjectListItem } from "@/lib/types";

type Mode = "project" | "upload";

interface Props {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
}

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

export function RunAgentDialog({ agentId, agentName, open, onClose }: Props) {
  const { lang } = useLanguage();
  const [mode, setMode] = useState<Mode>("project");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"docx" | "xlsx" | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      listProjects().then(setProjects).catch(() => {});
      setResult("");
      setError(null);
      setUploadedFiles([]);
      setSelectedProject("");
    }
  }, [open]);

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult("");
    setError(null);

    try {
      let res: Response;
      if (mode === "project") {
        if (!selectedProject) { setError(t("run_no_project", lang)); setRunning(false); return; }
        res = await runAgent(agentId, selectedProject);
      } else {
        if (!uploadedFiles.length) { setError(t("run_no_files", lang)); setRunning(false); return; }
        res = await runAgentUpload(agentId, uploadedFiles);
      }

      if (!res.body) throw new Error("No response body");

      for await (const event of parseSSE(res.body)) {
        if (event.type === "chunk") setResult((p) => p + event.text);
        else if (event.type === "error") setError(event.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("run_error", lang));
    } finally {
      setRunning(false);
    }
  }, [agentId, mode, selectedProject, uploadedFiles]);

  const handleDownload = async (format: "docx" | "xlsx") => {
    setExporting(format);
    try {
      const blob = await exportAgentOutput(agentId, result, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agentName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setExporting(null);
    }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setUploadedFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };

  const hasResult = result.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !running) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-base">{t("run_dialog_title", lang)} — {agentName}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          {/* Mode tabs */}
          {!hasResult && (
            <>
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

              {mode === "project" && (
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("run_select_project", lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {mode === "upload" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Upload className="h-6 w-6" />
                    <span>{t("run_upload_hint", lang)}</span>
                  </button>
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
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Results */}
          {(hasResult || running) && (
            <div
              ref={resultRef}
              className="min-h-[200px] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-relaxed"
            >
              {result}
              {running && <span className="inline-block h-4 w-1.5 animate-pulse bg-primary" />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          {hasResult ? (
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => { setResult(""); setError(null); }}
            >
              {t("run_again", lang)}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            {hasResult && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload("docx")}
                  disabled={!!exporting}
                  className="gap-1.5 text-xs"
                >
                  {exporting === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Word
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload("xlsx")}
                  disabled={!!exporting}
                  className="gap-1.5 text-xs"
                >
                  {exporting === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  Excel
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onClose} disabled={running}>{t("run_cancel", lang)}</Button>
            {!hasResult && (
              <Button onClick={handleRun} disabled={running}>
                {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("run_submit", lang)}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
