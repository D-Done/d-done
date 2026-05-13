"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import * as api from "@/lib/api";
import { uploadFile } from "@/lib/gcs-upload";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────

type FileStatus = "pending" | "uploading" | "complete" | "error";

interface VdrFile {
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  fileId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function VdrUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  // Project info state
  const [projectName, setProjectName] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<"loading" | "valid" | "expired" | "error">("loading");

  // File state
  const [files, setFiles] = useState<VdrFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload / submit state
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load token info ──
  useEffect(() => {
    api.getVdrPublicInfo(token)
      .then((info) => {
        if (info.status === "expired" || info.status === "revoked") {
          setTokenStatus("expired");
        } else {
          setProjectName(info.project_name);
          setTokenStatus("valid");
        }
      })
      .catch((err) => {
        if (err?.status === 410 || err?.status === 404) {
          setTokenStatus("expired");
        } else {
          setTokenStatus("error");
        }
      });
  }, [token]);

  // ── File helpers ──
  const updateFile = useCallback((index: number, patch: Partial<VdrFile>) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }, []);

  function addFiles(newFiles: File[]) {
    const entries: VdrFile[] = newFiles.map((f) => ({
      file: f,
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...entries]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Drag & drop ──
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) addFiles(selected);
    e.target.value = "";
  }

  // ── Upload all pending files ──
  async function uploadAllFiles(): Promise<boolean> {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);

    let allOk = true;

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      if (entry.status === "complete") continue;
      if (controller.signal.aborted) break;

      updateFile(i, { status: "uploading", progress: 0, error: undefined });

      try {
        const mime = resolveMime(entry.file);
        const initRes = await api.vdrInitiateUpload(token, {
          filename: entry.file.name,
          content_type: mime,
          file_size: entry.file.size,
        });

        if (initRes.already_exists) {
          updateFile(i, { status: "complete", progress: 100, fileId: initRes.file_id });
          continue;
        }

        if (!initRes.upload_url) {
          throw new Error("No upload URL");
        }

        await uploadFile(
          initRes.upload_url,
          entry.file,
          { onProgress: (p) => updateFile(i, { progress: p.percent }) },
          controller.signal,
        );

        await api.vdrCompleteUpload(token, initRes.file_id, entry.file.size);
        updateFile(i, { status: "complete", progress: 100, fileId: initRes.file_id });
      } catch (err) {
        if (controller.signal.aborted) break;
        const msg = err instanceof Error ? err.message : "שגיאה בהעלאה";
        updateFile(i, { status: "error", error: msg });
        allOk = false;
      }
    }

    setIsUploading(false);
    return allOk;
  }

  // ── Submit ──
  async function handleSubmit() {
    if (files.length === 0) return;
    setIsSubmitting(true);
    try {
      // Upload any pending files first
      const hasPending = files.some((f) => f.status !== "complete");
      if (hasPending) {
        const ok = await uploadAllFiles();
        if (!ok) {
          setIsSubmitting(false);
          return;
        }
      }
      await api.vdrSubmit(token);
      setSubmitted(true);
    } catch (err) {
      // Show error but don't block — files are already uploaded
      alert(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Auto-upload on file add ──
  useEffect(() => {
    if (isUploading || isSubmitting || submitted) return;
    const hasPending = files.some((f) => f.status === "pending");
    if (!hasPending) return;
    const t = setTimeout(() => { uploadAllFiles(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const anyComplete = files.some((f) => f.status === "complete");
  const anyUploading = files.some((f) => f.status === "uploading");
  const anyError = files.some((f) => f.status === "error");

  // ── Render ──

  if (tokenStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (tokenStatus === "expired" || tokenStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <XCircle className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">הקישור אינו תקף</h1>
          <p className="text-slate-500 text-sm">
            {tokenStatus === "expired"
              ? "תוקף הקישור להעלאה פג. אנא בקש קישור חדש."
              : "הקישור אינו תקף. אנא בקש קישור חדש."}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-900">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">תודה!</h1>
            <p className="mt-2 text-slate-500">המסמכים הועלו בהצלחה.</p>
            <p className="mt-1 text-sm text-slate-400">ניתן לסגור חלון זה.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            D<span className="text-slate-400">-Done</span>
          </span>
          <h1 className="text-lg font-semibold text-slate-700 mt-2">
            העלאת מסמכי VDR
          </h1>
          {projectName && (
            <p className="text-sm text-slate-500">
              פרויקט: <span className="font-medium text-slate-700">{projectName}</span>
            </p>
          )}
        </div>

        {/* Drop zone */}
        <div
          className={[
            "relative rounded-2xl border-2 border-dashed p-10 text-center transition cursor-pointer",
            isDragging
              ? "border-slate-900 bg-slate-100"
              : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50",
          ].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">גרור מסמכים לכאן</p>
              <p className="text-sm text-slate-400 mt-0.5">או לחץ לבחירת קבצים</p>
            </div>
            <p className="text-xs text-slate-400">PDF, Word, Excel, תמונות ועוד</p>
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(f.file.size)}</p>
                  {f.status === "uploading" && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-700 transition-all duration-200 rounded-full"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                  {f.error && (
                    <p className="text-xs text-red-500 mt-0.5">{f.error}</p>
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0">
                  {f.status === "complete" && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  )}
                  {f.status === "uploading" && (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  )}
                  {f.status === "error" && (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  {f.status === "pending" && (
                    <div className="h-2 w-2 rounded-full bg-slate-300" />
                  )}
                </div>

                {/* Remove button (only when not uploading) */}
                {!isUploading && f.status !== "uploading" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submit button */}
        {files.length > 0 && (
          <Button
            className="w-full rounded-2xl h-12 text-base"
            disabled={isUploading || isSubmitting || anyUploading || (!anyComplete && !anyError)}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                שולח...
              </>
            ) : isUploading || anyUploading ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                מעלה מסמכים...
              </>
            ) : (
              <>
                <Upload className="ml-2 h-5 w-5" />
                סיום העלאה
              </>
            )}
          </Button>
        )}

        <p className="text-center text-xs text-slate-400">
          המסמכים מועברים בצורה מאובטחת ומוצפנת
        </p>
      </div>
    </div>
  );
}
