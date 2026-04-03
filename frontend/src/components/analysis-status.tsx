"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  Bot, 
  Check, 
  FileCheck, 
  BrainCircuit 
} from "lucide-react";

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
  /** Backend-reported pipeline stage when status is processing */
  pipeline_stage?: string | null;
  documents?: { id: string; original_filename: string; doc_type?: string }[];
}

const PIPELINE_STAGES = [
  {
    id: "doc_process",
    label: "מכין סביבת עבודה",
    description: "המערכת מנתחת את המסמכים ומכינה אותם לעיבוד",
    min: 0,
    max: 25,
  },
  {
    id: "extract",
    label: "עיבוד סוכני AI במקביל",
    description: "סוכנים מומחים מחלצים נתונים מהמסמכים בו-זמנית",
    min: 25,
    max: 60,
  },
  {
    id: "synthesis",
    label: "סיכום מבוסס AI",
    description: "איחוד כלל התובנות לתמונת מצב משפטית אחידה",
    min: 60,
    max: 90,
  },
  {
    id: "done",
    label: "מפיק דוח",
    description: "בניית הדוח הסופי ואימות ציטוטים מול מסמכי המקור",
    min: 90,
    max: 101,
  },
] as const;

const BACKEND_STAGE_TO_INDEX: Record<string, number> = {
  doc_processing: 0,
  extraction: 1,
  synthesis: 2,
  hitl_tenant_review: 2,
  citation_locating: 3,
};

const DOC_TYPE_INFO: Record<string, { label: string }> = {
  tabu: { label: 'מנתח טאבו' },
  project_agreement: { label: 'מנתח הסכמים' },
  tama: { label: 'מנתח תמ״א' },
  zero_report: { label: 'מנתח פיננסי' },
  corporate_protocol: { label: 'מנתח החלטות' },
  company_extract: { label: 'מנתח חברות' },
  credit_committee: { label: 'מנתח אשראי' },
  id: { label: 'מנתח זהות' },
  lien: { label: 'מנתח שעבודים' },
  other: { label: 'מנתח מסמכים' },
};

const BOTTOM_NODES = [
  { id: 'synth', x: 450, y: 280, label: 'מנוע סיכום נתונים (AI)', icon: BrainCircuit },
  { id: 'report', x: 450, y: 360, label: 'דוח בדיקת נאותות סופי', icon: FileCheck },
];

const BOTTOM_CONNECTION = "M 450 302 L 450 338";

export function AnalysisStatus({
  transaction,
}: {
  transaction: AnalysisTransaction;
}) {
  const [progress, setProgress] = useState(0);
  const [completedDocs, setCompletedDocs] = useState<Set<string>>(new Set());

  // Derive active index
  const pipelineStageIndex =
    transaction.status === "processing" && transaction.pipeline_stage
      ? BACKEND_STAGE_TO_INDEX[transaction.pipeline_stage]
      : undefined;

  const currentStageIndex =
    pipelineStageIndex !== undefined
      ? pipelineStageIndex
      : PIPELINE_STAGES.findIndex((s) => progress >= s.min && progress < s.max);
  
  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

  // Memoize top nodes based on transaction.documents
  const topNodes = useMemo(() => {
    const docs = transaction.documents && transaction.documents.length > 0 
      ? transaction.documents.slice(0, 7) // max 7 for visual spacing
      : [
          { id: 'mock-1', original_filename: 'נסח טאבו', doc_type: 'tabu' },
          { id: 'mock-2', original_filename: 'הסכם פרויקט', doc_type: 'project_agreement' },
          { id: 'mock-3', original_filename: 'דו״ח אפס', doc_type: 'zero_report' },
          { id: 'mock-4', original_filename: 'מסמך כללי', doc_type: 'other' },
          { id: 'mock-5', original_filename: 'מסמך כללי', doc_type: 'other' },
        ];

    const CANVAS_WIDTH = 900;
    return docs.map((doc, i) => {
      const spacing = CANVAS_WIDTH / (docs.length + 1);
      const x = spacing * (i + 1);
      const typeInfo = doc.doc_type ? DOC_TYPE_INFO[doc.doc_type] : null;
      const label = typeInfo?.label || 'מנתח מסמכים';
      
      return {
        id: doc.id,
        x,
        y: 100,
        label,
        original_filename: doc.original_filename,
        connectionPath: `M ${x} 120 C ${x} 200, 450 190, 450 260`
      };
    });
  }, [transaction.documents]);

  // Handle continuous progress
  useEffect(() => {
    if (transaction.status !== "processing") return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const increment = Math.max(0.25, (100 - prev) * 0.018);
        return Math.min(prev + increment, 98);
      });
    }, 800);

    return () => clearInterval(interval);
  }, [transaction.status]);

  useEffect(() => {
    if (
      transaction.status === "completed" ||
      transaction.status === "partial"
    ) {
      setProgress(100);
      setCompletedDocs(new Set(topNodes.map(n => n.id)));
    }
  }, [transaction.status, topNodes]);

  // Simulate staggered document completion during "Extraction" stage
  useEffect(() => {
    if (activeIndex === 1 && transaction.status === "processing") {
      const timeouts: NodeJS.Timeout[] = [];
      topNodes.forEach((node, i) => {
        if (!completedDocs.has(node.id)) {
          // staggered random completion time between 1s to 5s
          const delay = 1000 + Math.random() * 3000 + (i * 800);
          const t = setTimeout(() => {
            setCompletedDocs(prev => {
              const next = new Set(prev);
              next.add(node.id);
              return next;
            });
          }, delay);
          timeouts.push(t);
        }
      });
      return () => timeouts.forEach(clearTimeout);
    } else if (activeIndex > 1) {
      // If we jumped straight to synthesis, mark all docs as completed —
      // but only if the set isn't already full (avoids infinite re-render).
      const allIds = topNodes.map(n => n.id);
      if (allIds.length > 0 && allIds.some(id => !completedDocs.has(id))) {
        setCompletedDocs(new Set(allIds));
      }
    }
  }, [activeIndex, topNodes, completedDocs, transaction.status]);

  const currentStage = PIPELINE_STAGES[activeIndex] ?? PIPELINE_STAGES[0];
  const StageLabel = currentStage.label;
  const isCompleted = transaction.status === "completed" || transaction.status === "partial";
  const isHitlPause = transaction.pipeline_stage === "hitl_tenant_review";

  const displayProgress =
    pipelineStageIndex !== undefined
      ? Math.min(95, (pipelineStageIndex + 1) * 25)
      : Math.max(progress, transaction.status === "processing" ? 12 : 0);

  let synthState = 'idle';
  if (activeIndex < 2 && !isCompleted) synthState = 'idle';
  else if (activeIndex === 2 && transaction.status === "processing") synthState = 'active';
  else if (activeIndex >= 3 || isCompleted) synthState = 'done';

  let reportState = 'idle';
  if (activeIndex < 3 && !isCompleted) reportState = 'idle';
  else if (activeIndex === 3 && transaction.status === "processing") reportState = 'active';
  else if (isCompleted) reportState = 'done';

  // Light theme colors
  const COLOR_INDIGO = "#6366f1"; // indigo-500
  const COLOR_LIGHT_INDIGO = "#e0e7ff"; // indigo-100
  const COLOR_SLATE_200 = "#e2e8f0"; // slate-200

  return (
    <div className="mx-auto w-full max-w-4xl rounded-[24px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 relative overflow-hidden font-sans" dir="rtl">
      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
          {transaction.title}
        </h2>
        <p className="mt-1.5 text-sm font-medium text-slate-500">
          {transaction.status === "pending"
            ? "ממתין לתחילת ניתוח..."
            : isCompleted
              ? "הניתוח הושלם בהצלחה"
              : isHitlPause
                ? "ממתין לאישורך — דרושה בדיקת טבלת חתימות"
                : `${StageLabel}...`}
        </p>
        {isHitlPause ? (
          <p className="mt-2 text-xs text-amber-500 max-w-md mx-auto font-medium">
            הניתוח מושהה עד לאישור הנתונים שמתחת
          </p>
        ) : transaction.status === "processing" && currentStage.description ? (
          <p className="mt-2 text-xs text-slate-400 max-w-md mx-auto">
            {currentStage.description}
          </p>
        ) : null}
      </div>

      {/* SVG Canvas for Agentic Workflow */}
      <div className="relative w-full aspect-2/1 max-h-[420px] mx-auto z-10" dir="ltr">
        <svg viewBox="0 0 900 400" className="w-full h-full overflow-visible">
          
          {/* Top Connections & Nodes */}
          {topNodes.map((node) => {
            let agentState = 'idle';
            if (activeIndex === 0) agentState = 'preparing';
            else if (activeIndex === 1) {
              agentState = completedDocs.has(node.id) ? 'flowing' : 'extracting';
            } else if (activeIndex >= 2 || isCompleted) {
              agentState = 'done';
            }

            const isFlowing = agentState === 'flowing';
            const isSolid = agentState === 'done';
            const isActive = agentState === 'extracting';

            return (
              <g key={`node-${node.id}`}>
                {/* Connection Path */}
                <path 
                  d={node.connectionPath} 
                  fill="none" 
                  stroke={COLOR_SLATE_200} 
                  strokeWidth="1.5" 
                  strokeDasharray={isSolid ? "none" : "4 6"} 
                />
                
                {isFlowing && (
                  <path 
                    d={node.connectionPath} 
                    fill="none" 
                    stroke={COLOR_INDIGO} 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeDasharray="4 8" 
                    style={{ animation: "dash-flow 0.8s linear infinite" }}
                  />
                )}
                
                {isSolid && (
                  <path 
                    d={node.connectionPath} 
                    fill="none" 
                    stroke={COLOR_LIGHT_INDIGO} 
                    strokeWidth="2" 
                  />
                )}

                {/* Node Foreign Object */}
                <foreignObject x={node.x - 70} y={node.y - 20} width={140} height={40} className="overflow-visible">
                  <div className={cn(
                    "w-full h-full rounded-full border bg-white flex items-center justify-center gap-2 px-3 transition-all duration-500",
                    isActive ? "border-indigo-400 bg-indigo-50 shadow-[0_0_15px_rgba(99,102,241,0.15)]" : 
                    isFlowing || isSolid ? "border-slate-200 text-slate-500" :
                    agentState === 'preparing' ? "border-slate-200 bg-slate-50 animate-pulse" :
                    "border-slate-100 bg-slate-50/50"
                  )} dir="rtl">
                    {/* Tiny Bot Icon representing the AI Agent */}
                    {isFlowing || isSolid ? (
                      <Check className="w-3.5 h-3.5 text-indigo-500" strokeWidth={2.5} />
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <Bot className={cn("w-3.5 h-3.5 z-10", isActive ? "text-indigo-600" : "text-slate-400")} />
                        {isActive && (
                          <div className="absolute inset-0 rounded-full bg-indigo-400/40 animate-ping shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                        )}
                      </div>
                    )}
                    <div className="flex flex-col items-start justify-center">
                      <span className={cn(
                        "text-[11px] font-bold tracking-wide whitespace-nowrap leading-none",
                        isActive ? "text-indigo-700" : 
                        isFlowing || isSolid ? "text-slate-600" : 
                        agentState === 'preparing' ? "text-slate-500" : "text-slate-400"
                      )}>
                        {node.label}
                      </span>
                    </div>
                  </div>
                  {/* Filename tooltip/subtitle */}
                  <div className={cn(
                    "absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap truncate max-w-[120px] transition-opacity duration-300",
                    isActive ? "text-indigo-500/80 font-medium" : "text-slate-400"
                  )}>
                    {node.original_filename}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Bottom Connection */}
          <g>
            <path d={BOTTOM_CONNECTION} fill="none" stroke={COLOR_SLATE_200} strokeWidth="1.5" strokeDasharray={reportState === 'done' ? "none" : "4 6"} />
            {reportState === 'active' && (
              <path 
                d={BOTTOM_CONNECTION} 
                fill="none" 
                stroke={COLOR_INDIGO} 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeDasharray="4 8" 
                style={{ animation: "dash-flow 0.8s linear infinite" }}
              />
            )}
            {reportState === 'done' && (
              <path 
                d={BOTTOM_CONNECTION} 
                fill="none" 
                stroke={COLOR_LIGHT_INDIGO} 
                strokeWidth="2" 
              />
            )}
          </g>

          {/* Bottom Nodes (Synthesis & Report) */}
          {BOTTOM_NODES.map((node) => {
            const state = node.id === 'synth' ? synthState : reportState;
            const isCompletedState = state === 'done';
            const isActive = state === 'active';
            const Icon = node.icon;
            
            return (
              <foreignObject key={node.id} x={node.x - 130} y={node.y - 22} width={260} height={44} className="overflow-visible">
                <div className={cn(
                  "w-full h-full rounded-full flex items-center justify-center gap-2.5 transition-all duration-500 border bg-white",
                  isCompletedState ? "border-indigo-200 bg-indigo-50/50" : 
                  isActive ? "border-indigo-400 bg-indigo-50 shadow-[0_4px_20px_rgba(99,102,241,0.15)] scale-105" : 
                  "border-slate-200 text-slate-400",
                )} dir="rtl">
                  {state === 'done' && node.id === 'report' ? (
                    <Check className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                  ) : (
                    <Icon className={cn("w-4 h-4", isCompletedState || isActive ? "text-indigo-600" : "text-slate-300")} />
                  )}
                  <span className={cn(
                    "text-[13px] font-bold tracking-wide",
                    isCompletedState || isActive ? "text-indigo-800" : "text-slate-400"
                  )}>
                    {node.label}
                  </span>
                </div>
              </foreignObject>
            );
          })}
        </svg>

        {/* Global animation style for the dashed flowing lines */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes dash-flow {
            to { stroke-dashoffset: -24; }
          }
        `}} />
      </div>

      {/* Progress Footer */}
      <div className="space-y-3 relative z-10 mt-6">
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
          <div 
            className="h-full bg-indigo-500 transition-all duration-500 ease-out" 
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <p className="text-center text-[11px] font-medium text-slate-400">
          {isHitlPause
            ? "הניתוח ימשיך אוטומטית לאחר האישור."
            : activeIndex >= PIPELINE_STAGES.length - 1 && transaction.status === "processing"
              ? "השלב האחרון כולל איחוד הדוח ואימות ציטוטים במסמכים — תקבל התראה עם סיום."
              : "הניתוח עשוי לקחת מספר דקות. תקבל התראה עם סיום."}
        </p>
      </div>
    </div>
  );
}
