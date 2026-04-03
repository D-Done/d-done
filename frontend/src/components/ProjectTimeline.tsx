"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarDays, ChevronDown, Clock, FileText } from "lucide-react";

export type ProjectTimelineEvent = {
  date: string;
  description: string;
  source: string;
  isHighlighted?: boolean;
};

function parseDateMs(input: string): number | null {
  if (!input) return null;
  const parts = input.split(/[./-]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt.getTime();
  }
  const ms = Date.parse(input);
  return Number.isFinite(ms) ? ms : null;
}

function formatDateHe(input: string): string {
  if (!input) return "—";
  const ms = parseDateMs(input);
  if (!ms) return input;
  return new Date(ms).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProjectTimeline({
  title = "ציר זמן עובדתי",
  events = [],
  className,
}: {
  title?: string;
  events: ProjectTimelineEvent[];
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const normalized = useMemo(() => {
    return events
      .map((e, idx) => ({ ...e, _idx: idx, _ms: parseDateMs(e.date) }))
      .filter((e) => e._ms !== null)
      .sort((a, b) => (b._ms ?? 0) - (a._ms ?? 0));
  }, [events]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden",
          className,
        )}
        dir="rtl"
      >
        {/* ── Header (clickable) ───────────────────────── */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full items-center gap-3 px-6 pt-5 pb-4 text-right hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors duration-150"
        >
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2 shrink-0">
            <Clock className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[280px]">
              אירועים מתוארכים מהמסמכים לפי סדר כרונולוגי
            </TooltipContent>
          </Tooltip>
          {normalized.length > 0 && (
            <Badge
              variant="secondary"
              className="mr-auto text-[11px] tabular-nums"
            >
              {normalized.length} אירועים
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-300",
              isOpen && "rotate-180",
            )}
          />
        </button>

        <Separator />

        {/* ── Collapsible body ───────────────────────────── */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-in-out",
            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            {normalized.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-300 dark:text-slate-500">
                <CalendarDays className="h-12 w-12 stroke-[1.2]" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  לא נמצאו אירועים מתוארכים במסמכים.
                </p>
              </div>
            ) : (
              <div className="px-6 py-5">
                {normalized.map((ev, idx) => {
                  const isActive = activeIndex === idx;
                  const isLast = idx === normalized.length - 1;

                  return (
                    <div
                      key={ev._idx}
                      className="group/row flex"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseLeave={() => setActiveIndex(null)}
                    >
                      {/* ── Spine column: dot + connector ── */}
                      <div className="flex w-5 shrink-0 flex-col items-center">
                        <div
                          className={cn(
                            "mt-[18px] shrink-0 rounded-full transition-all duration-300",
                            isActive
                              ? "h-3 w-3 bg-amber-500 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]"
                              : ev.isHighlighted
                                ? "h-2.5 w-2.5 bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.1)]"
                                : "h-2.5 w-2.5 bg-slate-300 dark:bg-slate-600 shadow-[0_0_0_3px_rgba(148,163,184,0.12)] dark:shadow-[0_0_0_3px_rgba(71,85,105,0.3)]",
                          )}
                        />
                        {!isLast && (
                          <div className="mt-1 w-px flex-1 bg-linear-to-b from-slate-200 to-slate-100 dark:from-slate-600 dark:to-slate-800" />
                        )}
                      </div>

                      {/* ── Event card ── */}
                      <div
                        className={cn(
                          "min-w-0 flex-1",
                          isLast ? "pb-1" : "pb-2",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-xl border px-4 py-3 transition-all duration-200 cursor-default",
                            isActive
                              ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 shadow-sm"
                              : "border-transparent bg-transparent",
                          )}
                        >
                          {/* Date */}
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CalendarDays
                              className={cn(
                                "h-3 w-3 transition-colors duration-200",
                                isActive ? "text-amber-500 dark:text-amber-400" : "text-slate-300 dark:text-slate-500",
                              )}
                            />
                            <time
                              className={cn(
                                "text-[11px] tabular-nums leading-none transition-colors duration-200",
                                isActive
                                  ? "font-semibold text-amber-600 dark:text-amber-400"
                                  : "text-slate-400 dark:text-slate-500",
                              )}
                            >
                              {formatDateHe(ev.date)}
                            </time>
                          </div>

                          {/* Description */}
                          <p
                            className={cn(
                              "text-sm leading-relaxed transition-colors duration-200",
                              isActive
                                ? "font-medium text-slate-900 dark:text-slate-100"
                                : "text-slate-600 dark:text-slate-300",
                            )}
                          >
                            {ev.description}
                          </p>

                          {/* Source */}
                          <div className="mt-2.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "cursor-default gap-1 px-2 py-0.5 text-[10px] font-normal transition-colors duration-200",
                                      isActive
                                        ? "border-amber-200/80 text-amber-600/80"
                                        : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500",
                                    )}
                                  >
                                    <FileText className="h-2.5 w-2.5" />
                                    {ev.source}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={4}>
                                <span>מקור: {ev.source}</span>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
