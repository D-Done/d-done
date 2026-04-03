"use client";

import { cn } from "@/lib/utils";

const PASTEL_COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/70 dark:text-rose-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/70 dark:text-sky-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/70 dark:text-violet-200",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/70 dark:text-pink-200",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/70 dark:text-cyan-200",
  "bg-lime-100 text-lime-700 dark:bg-lime-900/70 dark:text-lime-200",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/70 dark:text-orange-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/70 dark:text-teal-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-200",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/70 dark:text-fuchsia-200",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface PastelAvatarProps {
  name?: string | null;
  email: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function PastelAvatar({ name, email, size = "md", className }: PastelAvatarProps) {
  const colorIndex = hashString(email) % PASTEL_COLORS.length;
  const colorClass = PASTEL_COLORS[colorIndex];
  const initials = getInitials(name, email);

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0",
        SIZE_CLASSES[size],
        colorClass,
        className
      )}
      title={name || email}
    >
      {initials}
    </div>
  );
}
