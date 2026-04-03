"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import type { TableHTMLAttributes } from "react";
import { he } from "date-fns/locale";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

/** RTL table so weekdays and days flow right-to-left. */
function RtlMonthGrid(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table {...props} dir="rtl" />;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        "w-full max-w-[320px] rounded-xl bg-white p-4 font-sans text-foreground",
        className,
      )}
    >
      <DayPicker
        locale={he}
        weekStartsOn={0}
        dir="rtl"
        showOutsideDays={showOutsideDays}
        className="w-full"
        classNames={{
          root: "rdp-root w-full",
          months: "flex flex-col gap-4",
          month: "space-y-3",
          month_caption:
            "flex justify-center items-center gap-2 pt-0 pb-3 relative min-h-9",
          caption_label:
            "text-[1rem] font-semibold text-slate-800 tabular-nums",
          nav: "flex items-center gap-0.5",
          button_previous: cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "absolute right-0 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-0 shadow-none",
          ),
          button_next: cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "absolute left-0 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-0 shadow-none",
          ),
          month_grid: "w-full border-collapse table-fixed",
          weekdays: "border-b border-slate-200/80 pb-2",
          weekday:
            "text-slate-500 w-9 font-medium text-[0.75rem] py-2 text-center",
          weeks: "",
          week: "mt-0",
          day: "p-0 text-center text-sm align-middle",
          day_button: cn(
            "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium text-slate-700",
            "hover:bg-slate-100 hover:text-slate-900 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
            "aria-selected:opacity-100",
          ),
          selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-semibold",
          today:
            "bg-primary/10 text-primary font-semibold ring-1 ring-primary/30 hover:bg-primary/15",
          outside:
            "text-slate-300 aria-selected:bg-primary/10 aria-selected:text-slate-500",
          disabled: "text-slate-300 cursor-not-allowed opacity-60",
          range_middle: "aria-selected:bg-primary/10 aria-selected:text-slate-900",
          hidden: "invisible",
          ...classNames,
        }}
        formatters={{
          formatCaption: (month) => format(month, "LLLL yyyy", { locale: he }),
          formatWeekdayName: (weekday) =>
            HEBREW_WEEKDAYS[weekday.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6],
        }}
        labels={{
          labelNav: () => "ניווט חודשים",
          labelPrevious: () => "חודש קודם",
          labelNext: () => "חודש הבא",
          labelDayButton: (date, modifiers) => {
            const base = format(date, "d MMMM yyyy", { locale: he });
            if (modifiers.today) return `היום, ${base}`;
            if (modifiers.selected) return `נבחר, ${base}`;
            return `בחר תאריך: ${base}`;
          },
        }}
        components={{
          MonthGrid: RtlMonthGrid,
          Chevron: ({ orientation, className: iconClassName, ...cprops }) => {
            const size = cprops.size ?? 16;
            const cls = cn("text-current", iconClassName);
            switch (orientation) {
              case "left":
                return <ChevronRight className={cls} size={size} />;
              case "right":
                return <ChevronLeft className={cls} size={size} />;
              case "up":
                return <ChevronUp className={cls} size={size} />;
              case "down":
                return <ChevronDown className={cls} size={size} />;
              default:
                return <ChevronRight className={cls} size={size} />;
            }
          },
        }}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
