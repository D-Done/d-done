"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, Briefcase, FileText, FileUp, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export type CreationStepId = "type" | "details" | "documents" | "analysis";

export const CREATION_STEPS: Array<{
  id: CreationStepId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "type", label: "סוג העסקה", icon: Briefcase },
  { id: "details", label: "פרטי הפרוייקט", icon: FileText },
  { id: "documents", label: "העלאת מסמכים", icon: FileUp },
  { id: "analysis", label: "ניתוח AI", icon: Bot },
];

const STEP_ORDER: CreationStepId[] = ["type", "details", "documents", "analysis"];

function stepIndex(step: CreationStepId): number {
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 ? i : 0;
}

const CIRCLE_SIZE = 44; // 44px minimum touch target (WCAG)

export function CreationStepper({
  currentStep,
  onStepClick,
  className,
}: {
  currentStep: CreationStepId;
  onStepClick?: (step: CreationStepId) => void;
  className?: string;
}) {
  const currentIndex = stepIndex(currentStep);

  return (
    <div
      className={cn("w-full", className)}
      dir="rtl"
      aria-label="שלבי יצירת פרויקט"
      role="navigation"
    >
      {/* Row 1: circles + connectors — line runs through circle centers */}
      <div
        className="grid w-full items-center gap-0"
        style={{
          gridTemplateColumns: "1fr minmax(16px, 2fr) 1fr minmax(16px, 2fr) 1fr minmax(16px, 2fr) 1fr",
          gridTemplateRows: "44px",
        }}
      >
        {CREATION_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;
          const canNavigate = onStepClick && index <= currentIndex;
          const isConnectorFilled = currentIndex >= index;

          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <div
                  className="flex items-center justify-center h-full px-0.5"
                  aria-hidden
                >
                  <div className="relative w-full h-[2px] rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 right-0 bg-primary rounded-full"
                      initial={false}
                      animate={{ width: isConnectorFilled ? "100%" : "0%" }}
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center min-w-0">
                <motion.button
                  type="button"
                  onClick={() => canNavigate && onStepClick(step.id)}
                  disabled={!canNavigate}
                  initial={false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "touch-manipulation select-none",
                    canNavigate && "cursor-pointer hover:opacity-90 active:scale-[0.98]",
                    !canNavigate && "cursor-default",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !isCompleted &&
                      !isCurrent &&
                      "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                  )}
                  style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-disabled={!canNavigate}
                  aria-label={`${step.label}${isCompleted ? " – הושלם" : isCurrent ? " – נוכחי" : ""}`}
                >
                  {isCompleted ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 26 }}
                    >
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    </motion.span>
                  ) : (
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isCurrent ? "text-primary-foreground" : "text-slate-400 dark:text-slate-500",
                      )}
                    />
                  )}
                </motion.button>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Row 2: labels — aligned under circles */}
      <div
        className="grid w-full gap-0 mt-2"
        style={{
          gridTemplateColumns: "1fr minmax(16px, 2fr) 1fr minmax(16px, 2fr) 1fr minmax(16px, 2fr) 1fr",
        }}
      >
        {CREATION_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <React.Fragment key={`label-${step.id}`}>
              {index > 0 && <div aria-hidden />}
              <div className="flex justify-center min-w-0 px-0.5">
                <span
                  className={cn(
                    "text-center text-xs font-medium leading-snug transition-colors max-w-[90px]",
                    isCurrent && "text-foreground",
                    isCompleted && "text-muted-foreground",
                    !isCurrent && !isCompleted && "text-muted-foreground/70",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
