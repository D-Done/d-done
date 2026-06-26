"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { configureAgent, initiateAgentFileUpload, completeAgentFileUpload } from "@/lib/api";
import { uploadFile } from "@/lib/gcs-upload";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";

interface UploadedFile {
  file_id: string;
  original_name: string;
  gcs_uri: string;
  size_bytes?: number;
}

interface CreateAgentFormProps {
  agentId: string;
}

export function CreateAgentForm({ agentId }: CreateAgentFormProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; instructions?: string; general?: string }>({});
  const [dragOver, setDragOver] = useState(false);

  const uploadSingleFile = useCallback(
    async (file: File) => {
      setUploadingFile(true);
      try {
        const { upload_url, file_id, gcs_uri } = await initiateAgentFileUpload(
          agentId,
          file.name,
          file.type || "application/pdf",
          file.size,
        );
        await uploadFile(upload_url, file);
        await completeAgentFileUpload(agentId, file_id, file.name, gcs_uri, file.size);
        setFiles((prev) => [...prev, { file_id, original_name: file.name, gcs_uri, size_bytes: file.size }]);
      } catch {
        // silently ignore per-file errors — user can retry by uploading again
      } finally {
        setUploadingFile(false);
      }
    },
    [agentId],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadSingleFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadSingleFile(file);
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("create_agent_error_name", lang);
    if (!instructions.trim()) errs.instructions = t("create_agent_error_instructions", lang);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setErrors({});
    setSubmitting(true);
    try {
      await configureAgent(agentId, { name: name.trim(), system_prompt: instructions.trim() });
      router.push("/agents");
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : t("builder_error_msg", lang) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">{t("builder_page_title", lang)}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t("builder_page_subtitle", lang)}</p>

      {errors.general && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.general}
        </div>
      )}

      {/* Name */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium">
          {t("create_agent_name_label", lang)}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create_agent_name_placeholder", lang)}
          className={[
            "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none",
            "placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
            errors.name ? "border-destructive" : "",
          ].join(" ")}
        />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Instructions */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium">
          {t("create_agent_instructions_label", lang)}
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("create_agent_instructions_placeholder", lang)}
          rows={10}
          className={[
            "w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none",
            "placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
            errors.instructions ? "border-destructive" : "",
          ].join(" ")}
        />
        {errors.instructions && <p className="mt-1 text-xs text-destructive">{errors.instructions}</p>}
      </div>

      {/* Reference documents */}
      <div className="mb-8">
        <label className="mb-1.5 block text-sm font-medium">
          {t("create_agent_docs_label", lang)}
        </label>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploadingFile && fileInputRef.current?.click()}
          className={[
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
            uploadingFile ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadingFile ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("create_agent_uploading", lang)}</p>
            </>
          ) : (
            <>
              <Paperclip className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("create_agent_docs_hint", lang)}</p>
            </>
          )}
        </div>

        {/* Uploaded files list */}
        {files.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {files.map((f) => (
              <li
                key={f.file_id}
                className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{f.original_name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.file_id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || uploadingFile}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("create_agent_creating", lang)}
          </>
        ) : (
          t("create_agent_submit", lang)
        )}
      </button>
    </form>
  );
}
