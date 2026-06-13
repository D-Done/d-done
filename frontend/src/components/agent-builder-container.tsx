"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentBuilderChat, type ChatMessage } from "./agent-builder-chat";
import { AgentPreviewPanel } from "./agent-preview-panel";
import { sendBuilderMessage, publishAgent } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { AgentPreview, KnowledgeBaseFile, BuilderSSEEvent } from "@/lib/types";

interface AgentBuilderContainerProps {
  agentId: string;
}

async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<BuilderSSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data) {
          try {
            yield JSON.parse(data) as BuilderSSEEvent;
          } catch {
            // ignore
          }
        }
      }
    }
  }
}

export function AgentBuilderContainer({ agentId }: AgentBuilderContainerProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [kbFiles, setKbFiles] = useState<KnowledgeBaseFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(
    async (message: string, attachedFileIds: string[]) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: message };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      try {
        const response = await sendBuilderMessage(agentId, message, attachedFileIds);
        if (!response.body) throw new Error("No response body");

        for await (const event of parseSSE(response.body)) {
          if (event.type === "chunk") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: m.content + event.text } : m,
              ),
            );
          } else if (event.type === "state_update") {
            setPreview(event.preview);
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)),
            );
          } else if (event.type === "error") {
            setError(event.message);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: t("builder_error_msg", lang), isStreaming: false }
                  : m,
              ),
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("builder_error_msg", lang);
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: t("builder_error_msg", lang), isStreaming: false }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [agentId, isStreaming, lang],
  );

  const handleFileUploaded = useCallback((file: KnowledgeBaseFile) => {
    setKbFiles((prev) => [...prev, file]);
  }, []);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setError(null);
    try {
      await publishAgent(agentId);
      router.push("/agents");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("builder_error_msg", lang));
    } finally {
      setIsPublishing(false);
    }
  }, [agentId, router, lang]);

  const isReady = Boolean(preview?.name && preview?.description);

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left — Chat */}
        <div className="flex min-h-0 flex-1 flex-col border-e">
          <div className="border-b px-4 py-3">
            <h1 className="text-sm font-semibold">{t("builder_page_title", lang)}</h1>
            <p className="text-xs text-muted-foreground">{t("builder_page_subtitle", lang)}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <AgentBuilderChat
              agentId={agentId}
              messages={messages}
              isStreaming={isStreaming}
              onSend={handleSend}
              onFileUploaded={handleFileUploaded}
            />
          </div>
        </div>

        {/* Right — Preview */}
        <div className="w-72 shrink-0 overflow-y-auto lg:w-80">
          <AgentPreviewPanel
            preview={preview}
            knowledgeBaseFiles={kbFiles}
            isReady={isReady}
            onPublish={handlePublish}
            isPublishing={isPublishing}
          />
        </div>
      </div>
    </div>
  );
}
