"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Play, Calendar } from "lucide-react";
import { listAgents } from "@/lib/api";
import type { CustomAgent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AgentsPage() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה בטעינה"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">סוכנים חכמים</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            סוכני AI מותאמים אישית לסקירת חוזים ומסמכים משפטיים
          </p>
        </div>
        <Link
          href="/agents/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          סוכן חדש
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <Bot className="h-16 w-16 opacity-20" />
          <div>
            <p className="font-medium text-foreground">אין סוכנים עדיין</p>
            <p className="mt-1 text-sm">
              בנה את הסוכן הראשון שלך — תוך דקות, ללא קוד
            </p>
          </div>
          <Link
            href="/agents/new"
            className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            בנה סוכן חדש
          </Link>
        </div>
      )}

      {/* Agent grid */}
      {!loading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: CustomAgent }) {
  const createdDate = new Date(agent.created_at).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">{agent.name ?? "סוכן ללא שם"}</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            פעיל
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {agent.description && (
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
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
                {agent.knowledge_base_files.length} מסמכי עזר
              </span>
            )}
            <button
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              onClick={() => {
                // TODO: wire up agent run modal / flow
                alert(`הרצת סוכן ${agent.id} — יש לבחור פרויקט להרצה`);
              }}
            >
              <Play className="h-3 w-3" />
              הרץ
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
