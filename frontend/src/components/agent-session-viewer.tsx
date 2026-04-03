"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Clock, Info, Loader2, RefreshCw } from "lucide-react";
import * as api from "@/lib/api";
import type { AgentSessionEvent, AgentSessionEventsResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── helpers ───────────────────────────────────────────────────────────────

const AUTHOR_LABELS: Record<string, string> = {
  user: "משתמש",
  system: "מערכת",
};

function authorLabel(author: string | null): string {
  if (!author) return "לא ידוע";
  return AUTHOR_LABELS[author] ?? author;
}

function formatTs(ts: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function authorColor(author: string | null): string {
  if (!author) return "bg-slate-100 text-slate-600";
  if (author === "user") return "bg-blue-100 text-blue-700";
  if (author === "system") return "bg-slate-100 text-slate-600";
  // agent names get a distinct colour
  return "bg-violet-100 text-violet-700";
}

// ─── sub-components ────────────────────────────────────────────────────────

function EventRow({ event, index }: { event: AgentSessionEvent; index: number }) {
  const [open, setOpen] = useState(false);
  const hasText = !!event.text;
  const hasRaw = !!event.raw && Object.keys(event.raw).length > 0;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-start gap-3 px-4 py-3 text-right hover:bg-slate-50 transition-colors">
            {/* index */}
            <span className="mt-0.5 w-6 shrink-0 text-xs text-slate-400 font-mono">
              {index + 1}
            </span>

            {/* author badge */}
            <Badge
              className={[
                "shrink-0 rounded-full text-[11px] font-medium mt-0.5",
                authorColor(event.author),
              ].join(" ")}
            >
              {authorLabel(event.author)}
            </Badge>

            {/* text preview */}
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              {hasText ? (
                <p className="truncate text-right">{event.text}</p>
              ) : (
                <span className="italic text-slate-400">ללא תוכן טקסט</span>
              )}
            </div>

            {/* timestamp */}
            {event.timestamp && (
              <span className="shrink-0 text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTs(event.timestamp)}
              </span>
            )}

            {/* expand toggle */}
            <span className="shrink-0 text-slate-400">
              {open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 text-sm" dir="ltr">
            {/* full text */}
            {hasText && (
              <div className="rounded-xl bg-slate-50 p-3 whitespace-pre-wrap text-slate-700 text-xs font-mono leading-relaxed">
                {event.text}
              </div>
            )}

            {/* metadata row */}
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              {event.id && (
                <span>
                  <span className="text-slate-400">event id: </span>
                  <span className="font-mono">{event.id}</span>
                </span>
              )}
              {event.invocation_id && (
                <span>
                  <span className="text-slate-400">invocation: </span>
                  <span className="font-mono">{event.invocation_id}</span>
                </span>
              )}
            </div>

            {/* raw JSON */}
            {hasRaw && (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                  JSON גולמי
                </summary>
                <pre className="mt-2 overflow-auto rounded-xl bg-slate-900 p-3 text-emerald-300 text-[11px] leading-relaxed max-h-64">
                  {JSON.stringify(event.raw, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SessionPanel({
  title,
  sessionId,
  events,
}: {
  title: string;
  sessionId: string | null;
  events: AgentSessionEvent[];
}) {
  if (!sessionId && events.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-violet-500" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full text-xs font-normal">
              {events.length} אירועים
            </Badge>
            {sessionId && (
              <span className="text-[11px] font-mono text-slate-400 hidden sm:block">
                {sessionId.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {events.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">אין אירועים לתצוגה</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {events.map((ev, i) => (
              <EventRow key={ev.id ?? i} event={ev} index={i} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── main export ───────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  checkId: string;
}

export function AgentSessionViewer({ projectId, checkId }: Props) {
  const [data, setData] = useState<AgentSessionEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCheckSessionEvents(projectId, checkId);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת נתוני הסשן");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, checkId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">טוען נתוני יומן AI…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          נסה שוב
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const noData =
    !data.agent_session_id &&
    !data.judge_session_id &&
    data.agent_events.length === 0 &&
    data.judge_events.length === 0;

  return (
    <div className="space-y-5">
      {/* header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4" />
          <span>נתוני יומן ה-AI מאוחסנים עם כל ריצה ומאפשרים ניתוח לאחר בדיקה</span>
        </div>
        <Button variant="ghost" size="sm" className="rounded-xl gap-2 text-slate-500" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          רענן
        </Button>
      </div>

      {noData ? (
        <div className="rounded-2xl border bg-slate-50 p-10 text-center text-sm text-slate-400">
          לא נמצאו נתוני סשן עבור בדיקה זו
        </div>
      ) : (
        <>
          <SessionPanel
            title="סוכן DD ראשי"
            sessionId={data.agent_session_id}
            events={data.agent_events}
          />
          <SessionPanel
            title="שופט QA"
            sessionId={data.judge_session_id}
            events={data.judge_events}
          />
        </>
      )}
    </div>
  );
}
