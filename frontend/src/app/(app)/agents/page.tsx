"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Plus, Play, Calendar, Pencil, Trash2, Share2, Check } from "lucide-react";
import { listAgents, getMe, renameAgent, deleteAgent } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { CustomAgent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AgentsPage() {
  const { lang } = useLanguage();
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((me) => { if (me) setCurrentUserId(me.id); }).catch(() => {});
    listAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  const handleRename = (id: string, name: string) => {
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, name } : a));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("agents_title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("agents_subtitle", lang)}</p>
        </div>
        <Link
          href="/agents/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t("agents_new", lang)}
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <Bot className="h-16 w-16 opacity-20" />
          <div>
            <p className="font-medium text-foreground">{t("agents_empty_title", lang)}</p>
            <p className="mt-1 text-sm">{t("agents_empty_subtitle", lang)}</p>
          </div>
          <Link
            href="/agents/new"
            className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("agents_build_new", lang)}
          </Link>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              lang={lang}
              currentUserId={currentUserId}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  lang,
  currentUserId,
  onDelete,
  onRename,
}: {
  agent: CustomAgent;
  lang: import("@/lib/i18n").Lang;
  currentUserId: string | null;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name ?? "");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOwner = currentUserId !== null && agent.created_by_id === currentUserId;
  const createdDate = new Date(agent.created_at).toLocaleDateString(
    lang === "he" ? "he-IL" : "en-US",
    { day: "numeric", month: "short", year: "numeric" },
  );

  const startEdit = () => {
    setEditName(agent.name ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === agent.name) { setEditing(false); return; }
    try {
      await renameAgent(agent.id, trimmed);
      onRename(agent.id, trimmed);
    } catch { /* ignore */ }
    setEditing(false);
  };

  const handleDelete = async () => {
    const msg = lang === "he" ? "למחוק את האייגנט?" : "Delete this agent?";
    if (!confirm(msg)) return;
    try {
      await deleteAgent(agent.id);
      onDelete(agent.id);
    } catch { /* ignore */ }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Card className="group transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              {editing ? (
                <input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
                  className="min-w-0 flex-1 rounded border px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <CardTitle className="truncate text-base">{agent.name ?? "—"}</CardTitle>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Action icons — always visible on hover */}
              <button
                onClick={handleShare}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                title={lang === "he" ? "שתף" : "Share"}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Share2 className="h-3.5 w-3.5" />}
              </button>
              {isOwner && (
                <>
                  <button
                    onClick={startEdit}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                    title={lang === "he" ? "שנה שם" : "Rename"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    title={lang === "he" ? "מחק" : "Delete"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              {!isOwner ? (
                <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                  {agent.created_by_name ?? t("agents_shared", lang)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {t("agents_active", lang)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {agent.description && (
            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {createdDate}
            </div>
            <div className="flex items-center gap-1.5">
              {agent.knowledge_base_files.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {agent.knowledge_base_files.length} {t("agents_ref_docs", lang)}
                </span>
              )}
              <button
                className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                onClick={() => router.push(`/agents/${agent.id}/run`)}
              >
                <Play className="h-3 w-3" />
                {t("agents_run", lang)}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

    </>
  );
}
