"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <div
      role="button"
      tabIndex={0}
      suppressHydrationWarning
      onClick={() => setTheme(isDark ? "light" : "dark")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setTheme(isDark ? "light" : "dark")
      }}
      aria-label={isDark ? "עבור למצב בהיר" : "עבור למצב כהה"}
      className={cn(
        "relative flex w-[60px] h-[30px] rounded-full cursor-pointer select-none",
        "bg-zinc-100 dark:bg-zinc-800",
        "border border-zinc-200 dark:border-zinc-700",
        "transition-colors duration-300",
        className
      )}
    >
      {/*
        Only the background knob moves — the icons stay fixed in their slots.
        light: knob at left-[3px] (behind sun)
        dark:  knob at left-[31px] (behind moon)
        container=60px, knob=24px → 31+24=55 ≤ 60, no overflow
      */}
      <div
        suppressHydrationWarning
        className="pointer-events-none absolute top-[3px] h-6 w-6 rounded-full bg-white dark:bg-zinc-600 shadow-sm transition-[left] duration-300 left-[3px] dark:left-[31px]"
      />

      {/* Sun — left slot (active in light mode) */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <Sun className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
      </div>

      {/* Moon — right slot (active in dark mode) */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <Moon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-300" strokeWidth={2} />
      </div>
    </div>
  )
}
