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
    <div className="w-full max-w-sm mx-auto" dir="rtl">
      <div
        className="rounded-3xl bg-white overflow-hidden"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)" }}
      >
        {/* ── Project header ── */}
        <div className="px-10 pt-12 pb-10 border-b border-zinc-100">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-300 mb-3">
            בדיקת נאותות
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 leading-snug">
            {transaction.title}
          </h2>
          <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed">
            {isCompleted ? (
              "הניתוח הושלם בהצלחה"
            ) : isHitlPause ? (
              "ממתין לאישורך — בדוק את טבלת החתימות"
            ) : (
              <>
                {activeStage?.label}
                <AnimatedDots />
              </>
            )}
          </p>
          {docCount > 0 && (
            <p className="mt-1 text-xs text-zinc-300">{docCount} מסמכים</p>
          )}
        </div>

        {/* ── Vertical steps ── */}
        <div className="px-10 py-8">
          {PIPELINE_STAGES.map((stage, i) => {
            const done   = isCompleted || i < activeIndex;
            const active = !isCompleted && i === activeIndex;
            const last   = i === PIPELINE_STAGES.length - 1;

            return (
              <div key={stage.id} className="flex gap-5">
                {/* Left: circle + line */}
                <div className="flex flex-col items-center">
                  {/* Circle */}
                  <div className={cn(
                    "h-6 w-6 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 mt-0.5",
                    done   ? "bg-zinc-900 border-zinc-900" :
                    active ? "border-zinc-800 bg-white" :
                             "border-zinc-200 bg-white",
                  )}>
                    {done ? (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    ) : active ? (
                      <div className="h-2 w-2 rounded-full bg-zinc-800 animate-pulse" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
                    )}
                  </div>
                  {/* Vertical connector */}
                  {!last && (
                    <div className={cn(
                      "w-px flex-1 my-2 min-h-[28px] transition-colors duration-500",
                      done ? "bg-zinc-900" : "bg-zinc-100",
                    )} />
                  )}
                </div>

                {/* Right: text */}
                <div className={cn("pb-7 last:pb-0 min-w-0", last && "pb-0")}>
                  <p className={cn(
                    "text-[13px] font-semibold leading-tight transition-colors duration-300",
                    done || active ? "text-zinc-800" : "text-zinc-300",
                  )}>
                    {stage.label}
                  </p>
                  {(done || active) && (
                    <p className={cn(
                      "text-[11px] mt-0.5 leading-relaxed transition-colors duration-300",
                      active ? "text-zinc-400" : "text-zinc-300",
                    )}>
                      {stage.sub}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Progress footer ── */}
        <div className="border-t border-zinc-100 px-10 py-6">
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-[11px] text-zinc-300 leading-tight max-w-[160px]">
              {isHitlPause
                ? "הניתוח ימשיך לאחר האישור"
                : isCompleted
                ? "הניתוח הסתיים"
                : "הניתוח עשוי לקחת מספר דקות"}
            </span>
            <span className="text-xs font-semibold text-zinc-400 tabular-nums">
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
