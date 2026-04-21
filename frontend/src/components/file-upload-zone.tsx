"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  Upload,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { uploadFile, type UploadProgress } from "@/lib/gcs-upload";
import type { DocumentType } from "@/lib/types";
import { DOC_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// ---- Types ----

export type FileUploadStatus = "pending" | "uploading" | "complete" | "error";

export interface FileEntry {
  file: File;
  docType: DocumentType;
  status: FileUploadStatus;
  /** Upload progress 0–100 */
  progress: number;
  error?: string;
  /** Database file ID, set after initiation */
  fileId?: string;
  /** Full GCS URI, set after initiation */
  gcsUri?: string;
}

export interface FileUploadZoneProps {
  /** Current list of file entries (controlled). */
  files: FileEntry[];
  /** Called when the file list changes. */
  onFilesChange: (files: FileEntry[]) => void;
  /** Whether uploading is in progress — disables editing controls. */
  isUploading?: boolean;
  /** Maximum number of files allowed. Defaults to 200. */
  maxFiles?: number;
  /** Accepted MIME types. Defaults to PDF only. */
  acceptedTypes?: string[];
  /** Label for the accepted file description. */
  acceptLabel?: string;
  /** Whether to show document type selectors. Defaults to true. */
  showDocTypeSelector?: boolean;
  /** Whether to show an overall progress bar. Defaults to false (per-file only). */
  showOverallProgress?: boolean;
}

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocumentType[];

const DEFAULT_ACCEPTED_TYPES = ["application/pdf"];

// ---- Component ----

export function FileUploadZone({
  files,
  onFilesChange,
  isUploading = false,
  maxFiles = 200,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  acceptLabel = "PDF",
  showDocTypeSelector = true,
  showOverallProgress = false,
}: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Computed
  const completedCount = files.filter((f) => f.status === "complete").length;
  const hasErrors = files.some((f) => f.status === "error");
  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
      : 0;

  // ---- File handling ----

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const accepted = Array.from(newFiles).filter((f) =>
        acceptedTypes.includes(f.type),
      );
      if (accepted.length === 0) {
        toast.error(`יש להעלות קבצי ${acceptLabel} בלבד`);
        return;
      }
      if (files.length + accepted.length > maxFiles) {
        toast.error(`ניתן להעלות עד ${maxFiles} קבצים`);
        return;
      }
      onFilesChange([
        ...files,
        ...accepted.map(
          (file): FileEntry => ({
            file,
            docType: "other" as DocumentType,
            status: "pending",
            progress: 0,
          }),
        ),
      ]);
    },
    [files, onFilesChange, acceptedTypes, acceptLabel, maxFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange],
  );

  const updateDocType = useCallback(
    (index: number, docType: DocumentType) => {
      onFilesChange(
        files.map((entry, i) =>
          i === index ? { ...entry, docType } : entry,
        ),
      );
    },
    [files, onFilesChange],
  );

  // ---- Drag & Drop ----

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isDragOver) setIsDragOver(true);
    },
    [isDragOver],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // ---- Format file size ----

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ---- Status icon per file ----

  function StatusIcon({ status }: { status: FileUploadStatus }) {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "complete":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileUp className="h-4 w-4 text-muted-foreground" />;
    }
  }

  // ---- Progress bar colour ----

  function progressBarClass(status: FileUploadStatus): string {
    switch (status) {
      case "complete":
        return "[&>[data-slot=progress-indicator]]:bg-green-600";
      case "error":
        return "[&>[data-slot=progress-indicator]]:bg-destructive";
      default:
        return "";
    }
  }

  // ---- Accept attribute for file input ----
  const acceptAttr = acceptedTypes.join(",");

  return (
    <div className="space-y-6">
      {/* Overall progress bar (optional; visible during upload) */}
      {showOverallProgress && isUploading && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {completedCount === files.length
                ? "כל הקבצים הועלו בהצלחה"
                : hasErrors
                  ? "חלק מהקבצים נכשלו"
                  : "מעלה קבצים..."}
            </span>
            <span className="text-muted-foreground">{totalProgress}%</span>
          </div>
          <Progress value={totalProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {completedCount} / {files.length} קבצים הושלמו
            </span>
            {hasErrors && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {files.filter((f) => f.status === "error").length} נכשלו
              </span>
            )}
          </div>
        </div>
      )}

      {/* Drop zone (hidden during upload) */}
      {!isUploading && (
        <div
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">
            גרור ושחרר קבצי {acceptLabel} כאן
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            או לחץ לבחירת קבצים (עד {maxFiles} קבצים)
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="ml-2 h-4 w-4" />
            בחר קבצים
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>
      )}

      {/* File list with per-file progress */}
      {files.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="font-medium">
              מסמכים ({completedCount}/{files.length} הועלו)
            </h3>
            {files.map((entry, index) => (
              <div
                key={`${entry.file.name}-${index}`}
                className="space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <StatusIcon status={entry.status} />

                  {/* File info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(entry.file.size)}
                      {entry.error && (
                        <span className="mr-2 text-destructive">
                          — {entry.error}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Doc type selector */}
                  {showDocTypeSelector && (
                    <Select
                      value={entry.docType}
                      onValueChange={(v) =>
                        updateDocType(index, v as DocumentType)
                      }
                      disabled={isUploading}
                      dir="rtl"
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((dt) => (
                          <SelectItem key={dt} value={dt}>
                            {DOC_TYPE_LABELS[dt]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Remove button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {/* Per-file progress bar */}
                {(entry.status === "uploading" ||
                  entry.status === "complete" ||
                  entry.status === "error") && (
                  <Progress
                    value={entry.progress}
                    className={`h-1.5 ${progressBarClass(entry.status)}`}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload orchestration hook
// ---------------------------------------------------------------------------

export interface UseFileUploadOptions {
  /** Maximum concurrent uploads. Defaults to 3. */
  concurrency?: number;
}

export interface UseFileUploadReturn {
  /** Upload all files for a given project. */
  uploadAll: (
    files: FileEntry[],
    projectId: string,
    onFileUpdate: (index: number, patch: Partial<FileEntry>) => void,
  ) => Promise<{ completed: number; failed: number }>;
  /** Abort all in-progress uploads. */
  abort: () => void;
  /** Whether an upload batch is currently running. */
  isUploading: boolean;
}

/**
 * Hook that orchestrates uploading a batch of files to GCS via the
 * backend resumable upload flow.
 *
 * Flow per file:
 * 1. POST /upload/initiate → get session URI + file_id (DB row created, status=pending)
 * 2. PUT chunks to GCS session URI (XHR with progress)
 * 3. POST /upload/complete → update DB row to "uploaded" (only on 200/201)
 */
export function useFileUpload(
  opts: UseFileUploadOptions = {},
): UseFileUploadReturn {
  const { concurrency = 3 } = opts;
  const abortRef = useRef<AbortController | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadAll = useCallback(
    async (
      files: FileEntry[],
      projectId: string,
      onFileUpdate: (index: number, patch: Partial<FileEntry>) => void,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsUploading(true);

      let completed = 0;
      let failed = 0;

      // Upload a single file
      async function uploadOne(entry: FileEntry, index: number) {
        onFileUpdate(index, { status: "uploading", progress: 0 });

        try {
          // 1. Initiate session (creates file row in DB with status=pending)
          const { upload_url, file_id, gcs_uri } = await api.initiateUpload({
            project_id: projectId,
            filename: entry.file.name,
            content_type: entry.file.type || "application/pdf",
            doc_type: entry.docType,
            file_size: entry.file.size,
          });

          onFileUpdate(index, { fileId: file_id, gcsUri: gcs_uri });

          // 2. Upload to GCS via resumable session (XHR with real-time progress)
          await uploadFile(
            upload_url,
            entry.file,
            {
              onProgress: (progress: UploadProgress) => {
                onFileUpdate(index, { progress: progress.percent });
              },
            },
            controller.signal,
          );

          // 3. Notify backend that GCS confirmed 200/201 → update DB to "uploaded"
          await api.completeUpload({
            file_id,
            file_size_bytes: entry.file.size,
          });

          onFileUpdate(index, { status: "complete", progress: 100 });
          completed++;
        } catch (err) {
          if (controller.signal.aborted) return;
          const message =
            err instanceof Error ? err.message : "Upload failed";
          onFileUpdate(index, { status: "error", error: message });
          failed++;
        }
      }

      // Process in batches for concurrency control
      const queue = files.map((entry, index) => ({ entry, index }));
      for (let i = 0; i < queue.length; i += concurrency) {
        if (controller.signal.aborted) break;
        const batch = queue.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(({ entry, index }) => uploadOne(entry, index)),
        );
      }

      setIsUploading(false);
      return { completed, failed };
    },
    [concurrency],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsUploading(false);
  }, []);

  return { uploadAll, abort, isUploading };
}
