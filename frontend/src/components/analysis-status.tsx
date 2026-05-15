"use client";

import { useEffect, useState, useMemo } from "react";
import { Check, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnalysisTransaction {
  id: string;
  title: string;
  description?: string;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "partial"
    | "needs_review";
  created_at: string;
  pipeline_stage?: string | null;
  documents?: { id: string; original_filename: string; doc_type?: string }[];
}

const PIPELINE_STAGES = [
  { id: "doc_process", label: "הכנת מסמכים",  sub: "סריקה ועיבוד ראשוני" },
  { id: "extract",    label: "חילוץ מקביל",   sub: "סוכני AI מחלצים נתונים" },
  { id: "synthesis",  label: "סיכום AI",       sub: "איחוד ממצאים והתייחסויות" },
  { id: "done",       label: "הפקת דוח",       sub: "בנייה ואימות ציטוטים" },
] as const;

const BACKEND_STAGE_TO_INDEX: Record<string, number> = {
  doc_processing:     0,
  extraction:         1,
  synthesis:          2,
  hitl_tenant_review: 2,
  citation_locating:  3,
};

function AnimatedDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN(x => (x % 3) + 1), 550);
    return () => clearInterval(t);
  }, []);
  return <span className="tracking-widest opacity-40">{Array(n).fill("·").join("")}</span>;
}

export function AnalysisStatus({ transaction }: { transaction: AnalysisTransaction }) {
  const [progress, setProgress] = useState(0);

  const pipelineStageIndex =
    transaction.status === "processing" && transaction.pipeline_stage
      ? BACKEND_STAGE_TO_INDEX[transaction.pipeline_stage]
      : undefined;

  const currentStageIndex =
    pipelineStageIndex !== undefined
      ? pipelineStageIndex
      : PIPELINE_STAGES.findIndex((_, i) => progress >= i * 25 && progress < (i + 1) * 25);

  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  const isCompleted = transaction.status === "completed" || transaction.status === "partial";
  const isProcessing = transaction.status === "processing";
  const isHitlPause  = transaction.pipeline_stage === "hitl_tenant_review";

  const docCount = useMemo(() => transaction.documents?.length ?? 0, [transaction.documents]);

  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      setProgress(p => Math.min(p + Math.max(0.2, (100 - p) * 0.016), 98));
    }, 800);
    return () => clearInterval(id);
  }, [isProcessing]);

  useEffect(() => { if (isCompleted) setProgress(100); }, [isCompleted]);

  const displayProgress =
    pipelineStageIndex !== undefined
      ? Math.min(95, (pipelineStageIndex + 1) * 25)
      : Math.max(progress, isProcessing ? 8 : 0);

  const activeStage = PIPELINE_STAGES[activeIndex];

  return (
    <div className="w-full" dir="rtl">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-sm">

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">

          {/* ── Left: project info + progress ── */}
          <div className="px-10 py-10 border-b lg:border-b-0 lg:border-l border-zinc-100 dark:border-zinc-800/50">

            {/* Label */}
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 dark:text-zinc-500 mb-5">
              בדיקת נאותות
            </p>

            {/* Project name */}
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight mb-2">
              {transaction.title}
            </h2>

            {/* Current stage / status */}
            <p className="text-base text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
              {isCompleted ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">הניתוח הושלם בהצלחה ✓</span>
              ) : isHitlPause ? (
                "ממתין לאישורך — בדוק את טבלת החתימות"
              ) : (
                <>{activeStage?.label}<AnimatedDots /></>
              )}
            </p>

            {/* Progress bar */}
            <div className="space-y-2 mb-8">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {isHitlPause
                    ? "הניתוח ימשיך לאחר האישור"
                    : isCompleted
                    ? "הניתוח הסתיים"
                    : "הניתוח עשוי לקחת מספר דקות"}
                </span>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {Math.round(displayProgress)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    isCompleted ? "bg-emerald-500" : "bg-zinc-900 dark:bg-zinc-100"
                  )}
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>

            {/* Document chips */}
            {docCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>{docCount} מסמכים מעובדים</span>
              </div>
            )}
          </div>

          {/* ── Right: pipeline steps ── */}
          <div className="px-8 py-10 bg-zinc-50/60 dark:bg-zinc-800/20">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 dark:text-zinc-500 mb-7">
              שלבי עיבוד
            </p>
            <div className="flex flex-col">
              {PIPELINE_STAGES.map((stage, i) => {
                const done   = isCompleted || i < activeIndex;
                const active = !isCompleted && i === activeIndex;
                const last   = i === PIPELINE_STAGES.length - 1;

                return (
                  <div key={stage.id} className="flex gap-4">
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-500 mt-0.5",
                        done   ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100" :
                        active ? "border-zinc-800 dark:border-zinc-300 bg-white dark:bg-zinc-900" :
                                 "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      )}>
                        {done ? (
                          <Check className="h-2.5 w-2.5 text-white dark:text-zinc-900" strokeWidth={3} />
                        ) : active ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-zinc-800 dark:bg-zinc-200 animate-pulse" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                        )}
                      </div>
                      {!last && (
                        <div className={cn(
                          "w-px flex-1 my-1.5 min-h-[24px] transition-colors duration-500",
                          done ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-150 dark:bg-zinc-700/50",
                        )} />
                      )}
                    </div>

                    {/* Step text */}
                    <div className={cn("pb-6 last:pb-0 min-w-0", last && "pb-0")}>
                      <p className={cn(
                        "text-sm font-semibold leading-tight transition-colors duration-300",
                        done || active
                          ? "text-zinc-800 dark:text-zinc-200"
                          : "text-zinc-300 dark:text-zinc-600",
                      )}>
                        {stage.label}
                      </p>
                      {(done || active) && (
                        <p className={cn(
                          "text-xs mt-0.5 leading-relaxed transition-colors duration-300",
                          active ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-300 dark:text-zinc-600",
                        )}>
                          {stage.sub}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
