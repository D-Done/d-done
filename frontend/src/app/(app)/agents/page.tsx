"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Play, Calendar } from "lucide-react";
import { listAgents } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { CustomAgent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AgentsPage() {
  const { lang } = useLanguage();
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

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
            <AgentCard key={agent.id} agent={agent} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, lang }: { agent: CustomAgent; lang: import("@/lib/i18n").Lang }) {
  const createdDate = new Date(agent.created_at).toLocaleDateString(
    lang === "he" ? "he-IL" : "en-US",
    { day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">{agent.name ?? "—"}</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {t("agents_active", lang)}
          </Badge>
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
              onClick={() => alert(`Run agent ${agent.id} — select a project`)}
            >
              <Play className="h-3 w-3" />
              {t("agents_run", lang)}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
