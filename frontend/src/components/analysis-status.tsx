"use client";

import { useEffect, useState, useMemo } from "react";
import { Bot, Check, FileCheck, BrainCircuit, Sparkles, FileText } from "lucide-react";
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
  { id: "doc_process", label: "הכנת מסמכים", min: 0, max: 25 },
  { id: "extract", label: "חילוץ מקביל", min: 25, max: 60 },
  { id: "synthesis", label: "סיכום AI", min: 60, max: 90 },
  { id: "done", label: "הפקת דוח", min: 90, max: 101 },
] as const;

const BACKEND_STAGE_TO_INDEX: Record<string, number> = {
  doc_processing: 0,
  extraction: 1,
  synthesis: 2,
  hitl_tenant_review: 2,
  citation_locating: 3,
};

const DOC_TYPE_INFO: Record<string, { label: string }> = {
  tabu: { label: "מנתח טאבו" },
  project_agreement: { label: "מנתח הסכמים" },
  agreement_additions: { label: "מנתח נספחים" },
  tama: { label: 'מנתח תמ"א' },
  zero_report: { label: "מנתח פיננסי" },
  corporate_protocol: { label: "מנתח החלטות" },
  company_docs: { label: "מנתח חברות" },
  credit_committee: { label: "מנתח אשראי" },
  signing_protocol: { label: "מנתח חתימות" },
  planning_permit: { label: "מנתח היתרים" },
  pledges_registry: { label: "מנתח שעבודים" },
  id: { label: "מנתח זהות" },
  other: { label: "מנתח מסמכים" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ index, active, done }: { index: number; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all duration-500 shrink-0",
        done
          ? "bg-indigo-500 border-indigo-500"
          : active
            ? "bg-white border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
            : "bg-white border-slate-200",
      )}
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      ) : active ? (
        <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
      ) : (
        <span className="text-[10px] font-semibold text-slate-300">{index + 1}</span>
      )}
    </div>
  );
}

type AgentState = "idle" | "preparing" | "extracting" | "flowing" | "done";

function AgentCard({
  label,
  filename,
  state,
}: {
  label: string;
  filename: string;
  state: AgentState;
}) {
  const isActive = state === "extracting";
  const isDone = state === "done" || state === "flowing";
  const isPreparing = state === "preparing";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-start gap-2.5 transition-all duration-500 min-w-0",
        isActive
          ? "border-indigo-300 bg-indigo-50/80 shadow-[0_2px_12px_rgba(99,102,241,0.12)]"
          : isDone
            ? "border-slate-200 bg-white"
            : isPreparing
              ? "border-slate-200 bg-slate-50/80 animate-pulse"
              : "border-slate-100 bg-slate-50/40 opacity-60",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300",
          isActive ? "bg-indigo-100" : isDone ? "bg-emerald-50" : "bg-slate-100",
        )}
      >
        {isDone ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
        ) : (
          <Bot
            className={cn(
              "h-3.5 w-3.5",
              isActive ? "text-indigo-500" : "text-slate-400",
            )}
          />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[12px] font-semibold leading-tight truncate",
            isActive ? "text-indigo-700" : isDone ? "text-slate-700" : "text-slate-500",
          )}
        >
          {label}
        </p>
        <p className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight">{filename}</p>
      </div>

      {/* Active pulse dot */}
      {isActive && (
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0 mt-1.5" />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnalysisStatus({ transaction }: { transaction: AnalysisTransaction }) {
  const [progress, setProgress] = useState(0);
  const [completedDocs, setCompletedDocs] = useState<Set<string>>(new Set());

  const pipelineStageIndex =
    transaction.status === "processing" && transaction.pipeline_stage
      ? BACKEND_STAGE_TO_INDEX[transaction.pipeline_stage]
      : undefined;

  const currentStageIndex =
    pipelineStageIndex !== undefined
      ? pipelineStageIndex
      : PIPELINE_STAGES.findIndex((s) => progress >= s.min && progress < s.max);

  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  const isCompleted =
    transaction.status === "completed" || transaction.status === "partial";
  const isProcessing = transaction.status === "processing";
  const isHitlPause = transaction.pipeline_stage === "hitl_tenant_review";

  const docNodes = useMemo(() => {
    const docs =
      transaction.documents && transaction.documents.length > 0
        ? transaction.documents.slice(0, 9)
        : [
            { id: "mock-1", original_filename: "נסח טאבו", doc_type: "tabu" },
            { id: "mock-2", original_filename: "הסכם פרויקט", doc_type: "project_agreement" },
            { id: "mock-3", original_filename: 'דו"ח אפס', doc_type: "zero_report" },
            { id: "mock-4", original_filename: "מסמך כללי", doc_type: "other" },
            { id: "mock-5", original_filename: "מסמך כללי", doc_type: "other" },
          ];

    return docs.map((doc) => ({
      id: doc.id,
      label: (doc.doc_type ? DOC_TYPE_INFO[doc.doc_type]?.label : null) ?? "מנתח מסמכים",
      filename: doc.original_filename,
    }));
  }, [transaction.documents]);

  // Continuous progress animation
  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const inc = Math.max(0.2, (100 - prev) * 0.016);
        return Math.min(prev + inc, 98);
      });
    }, 800);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Snap to 100 on completion
  useEffect(() => {
    if (isCompleted) {
      setProgress(100);
      setCompletedDocs(new Set(docNodes.map((n) => n.id)));
    }
  }, [isCompleted, docNodes]);

  // Staggered doc completion during extraction stage
  useEffect(() => {
    if (activeIndex === 1 && isProcessing) {
      const timeouts: NodeJS.Timeout[] = [];
      docNodes.forEach((node, i) => {
        if (!completedDocs.has(node.id)) {
          const delay = 1200 + Math.random() * 3000 + i * 700;
          const t = setTimeout(() => {
            setCompletedDocs((prev) => new Set([...prev, node.id]));
          }, delay);
          timeouts.push(t);
        }
      });
      return () => timeouts.forEach(clearTimeout);
    } else if (activeIndex > 1) {
      const allIds = docNodes.map((n) => n.id);
      if (allIds.some((id) => !completedDocs.has(id))) {
        setCompletedDocs(new Set(allIds));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isProcessing]);

  const displayProgress =
    pipelineStageIndex !== undefined
      ? Math.min(95, (pipelineStageIndex + 1) * 25)
      : Math.max(progress, isProcessing ? 12 : 0);

  const statusText = isCompleted
    ? "הניתוח הושלם בהצלחה"
    : isHitlPause
      ? "ממתין לאישורך — בדוק את טבלת החתימות"
      : transaction.status === "pending"
        ? "ממתין לתחילת ניתוח..."
        : `${PIPELINE_STAGES[activeIndex]?.label ?? ""}...`;

  const footerText = isHitlPause
    ? "הניתוח ימשיך אוטומטית לאחר האישור."
    : activeIndex >= PIPELINE_STAGES.length - 1 && isProcessing
      ? "השלב האחרון — איחוד הדוח ואימות ציטוטים. תקבל התראה עם סיום."
      : "הניתוח עשוי לקחת מספר דקות. תקבל התראה עם סיום.";

  return (
    <div className="w-full max-w-2xl mx-auto" dir="rtl">
      <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.05)] overflow-hidden">

        {/* ── Header ── */}
        <div className="px-7 py-6 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-[0_2px_8px_rgba(99,102,241,0.3)] shrink-0">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800 leading-tight truncate">
                {transaction.title}
              </h2>
              <p className={cn(
                "text-sm mt-0.5 leading-tight",
                isCompleted ? "text-emerald-600 font-medium" :
                isHitlPause ? "text-amber-600 font-medium" :
                "text-slate-500"
              )}>
                {statusText}
              </p>
            </div>
            {isProcessing && !isHitlPause && (
              <div className="flex gap-1 mr-auto shrink-0">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-indigo-400"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            )}
            {isCompleted && (
              <div className="mr-auto shrink-0 h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
              </div>
            )}
          </div>
        </div>

        {/* ── Pipeline Steps ── */}
        <div className="px-7 py-5 border-b border-slate-100">
          <div className="flex items-center gap-0">
            {PIPELINE_STAGES.map((stage, i) => {
              const isDone = isCompleted || i < activeIndex;
              const isActive = !isCompleted && i === activeIndex;
              return (
                <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <StepIndicator index={i} active={isActive} done={isDone} />
                    <span
                      className={cn(
                        "text-[11px] font-medium whitespace-nowrap transition-colors duration-300",
                        isDone ? "text-slate-600" :
                        isActive ? "text-indigo-600" :
                        "text-slate-400",
                      )}
                    >
                      {stage.label}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px mx-3 mb-4 transition-colors duration-500",
                        isDone ? "bg-indigo-200" : "bg-slate-200",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Document Agent Grid ── */}
        <div className="px-7 py-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            סוכני ניתוח
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {docNodes.map((node) => {
              let state: AgentState = "idle";
              if (activeIndex === 0) state = "preparing";
              else if (activeIndex === 1) {
                state = completedDocs.has(node.id) ? "flowing" : "extracting";
              } else if (activeIndex >= 2 || isCompleted) {
                state = "done";
              }
              return (
                <AgentCard
                  key={node.id}
                  label={node.label}
                  filename={node.filename}
                  state={state}
                />
              );
            })}
          </div>

          {/* Synthesis & Report pills */}
          <div className="mt-4 flex flex-col gap-2">
            {[
              {
                id: "synth",
                label: "מנוע סיכום נתונים",
                icon: BrainCircuit,
                active: !isCompleted && activeIndex === 2,
                done: isCompleted || activeIndex >= 3,
              },
              {
                id: "report",
                label: "דוח בדיקת נאותות סופי",
                icon: FileCheck,
                active: !isCompleted && activeIndex === 3,
                done: isCompleted,
              },
            ].map(({ id, label, icon: Icon, active, done }) => (
              <div
                key={id}
                className={cn(
                  "rounded-xl border px-4 py-2.5 flex items-center gap-3 transition-all duration-500",
                  done
                    ? "border-indigo-200 bg-indigo-50/60"
                    : active
                      ? "border-indigo-300 bg-indigo-50 shadow-[0_2px_12px_rgba(99,102,241,0.1)]"
                      : "border-slate-200 bg-slate-50/50",
                )}
              >
                <div className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                  done ? "bg-indigo-100" : active ? "bg-indigo-100" : "bg-slate-100",
                )}>
                  {done && id === "report" ? (
                    <Check className="h-3.5 w-3.5 text-indigo-500" strokeWidth={2.5} />
                  ) : (
                    <Icon className={cn("h-3.5 w-3.5", done || active ? "text-indigo-500" : "text-slate-300")} />
                  )}
                </div>
                <span className={cn(
                  "text-[13px] font-medium",
                  done || active ? "text-indigo-800" : "text-slate-400",
                )}>
                  {label}
                </span>
                {active && (
                  <div className="mr-auto h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Progress Footer ── */}
        <div className="px-7 py-4 bg-slate-50/60 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400">התקדמות</span>
            <span className="text-[11px] font-semibold text-indigo-500 tabular-nums">
              {Math.round(displayProgress)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2.5">{footerText}</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      ` }} />
    </div>
  );
}
