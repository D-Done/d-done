"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, User, Bot, Loader2, X } from "lucide-react";
import { uploadFile } from "@/lib/gcs-upload";
import { initiateAgentFileUpload, completeAgentFileUpload } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { KnowledgeBaseFile } from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface AgentBuilderChatProps {
  agentId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (message: string, attachedFileIds: string[]) => void;
  onFileUploaded: (file: KnowledgeBaseFile) => void;
}

export function AgentBuilderChat({
  agentId,
  messages,
  isStreaming,
  onSend,
  onFileUploaded,
}: AgentBuilderChatProps) {
  const { lang } = useLanguage();
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ name: string; id: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed, pendingFiles.map((f) => f.id));
    setInput("");
    setPendingFiles([]);
    setTimeout(scrollToBottom, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

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

      onFileUploaded({ file_id, original_name: file.name, gcs_uri, size_bytes: file.size });
      setPendingFiles((prev) => [...prev, { name: file.name, id: file_id }]);
    } catch (err) {
      console.error("File upload failed:", err);
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Bot className="h-12 w-12 opacity-20" />
              <div>
                <p className="font-medium">{t("builder_title", lang)}</p>
                <p className="mt-1 text-sm">{t("builder_empty_hint", lang)}</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div
                className={[
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-muted",
                ].join(" ")}
              >
                {msg.content}
                {msg.isStreaming && (
                  <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-current" />
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((f) => (
            <span key={f.id} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              {f.name}
              <button
                onClick={() => setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || isStreaming}
            title={t("builder_attach_tooltip", lang)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {uploadingFile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("builder_placeholder", lang)}
            disabled={isStreaming}
            rows={1}
            className={[
              "flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm leading-relaxed",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              "disabled:opacity-50 max-h-32 overflow-y-auto",
            ].join(" ")}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
