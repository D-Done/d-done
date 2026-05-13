"use client";

import { useEffect, useState, useMemo } from "react";
import { Check } from "lucide-react";
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
  { id: "doc_process", label: "הכנה" },
  { id: "extract",    label: "חילוץ" },
  { id: "synthesis",  label: "סיכום" },
  { id: "done",       label: "דוח" },
] as const;

const BACKEND_STAGE_TO_INDEX: Record<string, number> = {
  doc_processing:      0,
  extraction:          1,
  synthesis:           2,
  hitl_tenant_review:  2,
  citation_locating:   3,
};

function Dots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return <span className="inline-block w-6 text-left">{".".repeat(frame)}</span>;
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
      : PIPELINE_STAGES.findIndex((_, i) => {
          const min = i * 25;
          const max = (i + 1) * 25;
          return progress >= min && progress < max;
        });

  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  const isCompleted = transaction.status === "completed" || transaction.status === "partial";
  const isProcessing = transaction.status === "processing";
  const isHitlPause = transaction.pipeline_stage === "hitl_tenant_review";

  const docCount = useMemo(
    () => transaction.documents?.length ?? 0,
    [transaction.documents],
  );

  // Progress animation
  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      setProgress(p => Math.min(p + Math.max(0.2, (100 - p) * 0.016), 98));
    }, 800);
    return () => clearInterval(id);
  }, [isProcessing]);

  useEffect(() => {
    if (isCompleted) setProgress(100);
  }, [isCompleted]);

  const displayProgress =
    pipelineStageIndex !== undefined
      ? Math.min(95, (pipelineStageIndex + 1) * 25)
      : Math.max(progress, isProcessing ? 8 : 0);

  const statusText = isCompleted
    ? "הניתוח הושלם"
    : isHitlPause
    ? "ממתין לאישורך"
    : transaction.status === "pending"
    ? "ממתין לתחילת ניתוח"
    : PIPELINE_STAGES[activeIndex]?.label ?? "";

  return (
    <div className="w-full max-w-xl mx-auto" dir="rtl">
      <div className="rounded-2xl bg-white border border-zinc-200 shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">

        {/* Title */}
        <div className="px-10 pt-10 pb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {transaction.title}
          </h2>
          <p className="mt-2 text-sm text-zinc-400 font-normal">
            {isCompleted ? (
              "הניתוח הושלם בהצלחה"
            ) : isHitlPause ? (
              "ממתין לאישורך — בדוק את טבלת החתימות"
            ) : (
              <>
                {statusText}
                <Dots />
              </>
            )}
          </p>
          {docCount > 0 && (
            <p className="mt-1 text-xs text-zinc-300">
              {docCount} מסמכים בניתוח
            </p>
          )}
        </div>

        {/* Steps */}
        <div className="px-10 pb-8">
          <div className="flex items-center" dir="ltr">
            {PIPELINE_STAGES.map((stage, i) => {
              const done = isCompleted || i < activeIndex;
              const active = !isCompleted && i === activeIndex;
              return (
                <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    {/* Circle */}
                    <div className={cn(
                      "h-8 w-8 rounded-full border flex items-center justify-center transition-all duration-500",
                      done
                        ? "bg-zinc-900 border-zinc-900"
                        : active
                        ? "border-zinc-900 bg-white"
                        : "border-zinc-200 bg-white",
                    )}>
                      {done ? (
                        <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                      ) : active ? (
                        <div className="h-2 w-2 rounded-full bg-zinc-900 animate-pulse" />
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
                      )}
                    </div>
                    {/* Label */}
                    <span className={cn(
                      "text-[11px] font-medium transition-colors duration-300",
                      done || active ? "text-zinc-800" : "text-zinc-300",
                    )}>
                      {stage.label}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className={cn(
                      "flex-1 h-px mx-3 mb-5 transition-colors duration-500",
                      done ? "bg-zinc-900" : "bg-zinc-100",
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div className="border-t border-zinc-100 px-10 py-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] text-zinc-300">
              {isHitlPause
                ? "הניתוח ימשיך אוטומטית לאחר האישור"
                : isCompleted
                ? "הניתוח הסתיים"
                : "הניתוח עשוי לקחת מספר דקות"}
            </span>
            <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">
              {Math.round(displayProgress)}%
            </span>
          </div>
          <div className="h-px w-full bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
