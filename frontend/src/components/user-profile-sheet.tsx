"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, FolderOpen, Users, X, Zap, Crown } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { PastelAvatar } from "@/components/pastel-avatar";
import * as api from "@/lib/api";
import type { UserProfileData, LeaderboardEntry, LeaderboardResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function useCountUp(target: number, duration = 1400, started: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started) { setValue(0); return; }
    if (target === 0) { setValue(0); return; }
    let startTs: number | null = null;
    let frame: number;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
      else setValue(target);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, started]);
  return value;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function TokenBattleCard({
  label,
  ownTokens,
  memberTokens,
  isWinner,
  isMe,
  started,
}: {
  label: string;
  ownTokens: number;
  memberTokens: number;
  isWinner: boolean;
  isMe: boolean;
  started: boolean;
}) {
  const ownDisp = useCountUp(ownTokens, 1200, started);
  const mbrDisp = useCountUp(memberTokens, 1400, started);
  const totDisp = useCountUp(ownTokens + memberTokens, 1600, started);

  return (
    <div className={cn(
      "relative flex-1 rounded-2xl border p-4 transition-all",
      isWinner
        ? "border-amber-200 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/20 shadow-sm"
        : "border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/60"
    )}>
      {isWinner && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 bg-amber-400 dark:bg-amber-500 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
            <Crown className="h-2.5 w-2.5" /> מנצח
          </span>
        </div>
      )}

      <div className="mb-3 text-center">
        <span className={cn(
          "text-xs font-semibold",
          isMe ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"
        )}>
          {label}
        </span>
      </div>

      <div className="mb-4 text-center">
        <span className={cn(
          "text-2xl font-black tabular-nums tracking-tight block",
          isWinner
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-800 dark:text-slate-100"
        )}>
          {fmt(totDisp)}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 block">טוקנים סה"כ</span>
      </div>

      <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-zinc-700/40">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500">
            <Zap className="h-3 w-3 text-sky-400" /> פרויקטים שלי
          </span>
          <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{fmt(ownDisp)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500">
            <Users className="h-3 w-3 text-violet-400" /> כחבר
          </span>
          <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{fmt(mbrDisp)}</span>
        </div>
      </div>
    </div>
  );
}

function LeaderboardStrip({
  entries,
  currentUserId,
  targetUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
  targetUserId: string;
}) {
  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">
        דירוג ארגון
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/60 overflow-hidden">
        {entries.slice(0, 6).map((entry, idx) => {
          const isMe = entry.user_id === currentUserId;
          const isTarget = entry.user_id === targetUserId;
          return (
            <div
              key={entry.user_id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm",
                idx < entries.slice(0, 6).length - 1 && "border-b border-slate-100 dark:border-zinc-800/60",
                isMe && "bg-sky-50/60 dark:bg-sky-950/20",
                isTarget && !isMe && "bg-amber-50/50 dark:bg-amber-950/10"
              )}
            >
              <span className="w-5 text-center text-xs font-bold text-slate-400 dark:text-zinc-500 shrink-0">
                {medals[entry.rank] ?? entry.rank}
              </span>
              <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
                {entry.name || entry.email.split("@")[0]}
                {isMe && <span className="text-sky-500 dark:text-sky-400 text-xs font-normal mr-1"> (אני)</span>}
              </span>
              <span className="tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                {fmt(entry.total_tokens)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UserProfileSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [animStarted, setAnimStarted] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setProfile(null);
    setLeaderboard(null);
    setAnimStarted(false);
    setError(false);
    setLoading(true);

    Promise.all([api.getUserProfile(userId), api.getLeaderboard()])
      .then(([prof, lb]) => {
        setProfile(prof);
        setLeaderboard(lb);
        setTimeout(() => setAnimStarted(true), 300);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const currentUserId = leaderboard?.current_user_id ?? "";
  const myEntry = leaderboard?.entries.find((e) => e.user_id === currentUserId);
  const myOwn = myEntry?.own_tokens ?? 0;
  const myMbr = myEntry?.member_tokens ?? 0;
  const myTotal = myOwn + myMbr;
  const theirTotal = profile?.total_tokens ?? 0;
  const iAmWinner = myTotal > theirTotal;
  const theyWin = theirTotal > myTotal;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 gap-0 flex flex-col overflow-hidden border-l border-slate-200 dark:border-zinc-800/60" showCloseButton={false}>
        <SheetTitle className="sr-only">פרופיל משתמש</SheetTitle>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400 p-8"
            >
              <span className="text-3xl">⚠️</span>
              <span className="text-sm font-medium text-slate-500">לא ניתן לטעון את הפרופיל</span>
            </motion.div>
          )}

          {!error && loading && !profile && (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center flex-1"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </motion.div>
          )}

          {profile && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col flex-1 overflow-y-auto"
            >
              {/* Dark header — matches sidebar aesthetic */}
              <div className="relative bg-zinc-950 px-6 pt-12 pb-6 shrink-0">
                <button
                  onClick={() => onOpenChange(false)}
                  className="absolute top-4 end-4 rounded-xl p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col items-center text-center gap-3">
                  <PastelAvatar name={profile.name} email={profile.email} size="lg" className="ring-2 ring-white/10" />
                  <div>
                    <h2 className="text-lg font-bold text-zinc-100">
                      {profile.name || profile.email.split("@")[0]}
                    </h2>
                    <p className="text-sm text-zinc-400 mt-0.5">{profile.email}</p>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 mt-1.5">
                      <CalendarDays className="h-3 w-3" />
                      <span>הצטרף {formatDate(profile.joined_at)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 px-5 py-5 space-y-5 bg-zinc-50 dark:bg-zinc-950">

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/60 p-4 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-600/50 bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-slate-300 mx-auto mb-2">
                      <Users className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{profile.shared_projects_count}</div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">פרויקטים משותפים</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/60 p-4 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-600/50 bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-slate-300 mx-auto mb-2">
                      <FolderOpen className="h-4 w-4 text-sky-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{profile.total_project_count}</div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">פרויקטים סה"כ</div>
                  </div>
                </div>

                {/* Shared project tags */}
                {profile.shared_project_names.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-2">פרויקטים משותפים</div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.shared_project_names.map((name) => (
                        <span
                          key={name}
                          className="inline-block bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700/50 text-xs px-2.5 py-1 rounded-full shadow-sm"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token battle */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-3">תחרות טוקנים</div>
                  <div className="flex gap-2 items-stretch">
                    <TokenBattleCard
                      label="אני"
                      ownTokens={myOwn}
                      memberTokens={myMbr}
                      isWinner={iAmWinner}
                      isMe={true}
                      started={animStarted}
                    />
                    <div className="flex items-center justify-center text-sm font-black text-slate-300 dark:text-zinc-600 shrink-0 select-none px-1">
                      VS
                    </div>
                    <TokenBattleCard
                      label={profile.name?.split(" ")[0] || profile.email.split("@")[0]}
                      ownTokens={profile.own_tokens}
                      memberTokens={profile.member_tokens}
                      isWinner={theyWin}
                      isMe={false}
                      started={animStarted}
                    />
                  </div>
                  {!iAmWinner && !theyWin && (myTotal > 0 || theirTotal > 0) && (
                    <div className="mt-3 text-center text-sm text-slate-400">🤝 תיקו!</div>
                  )}
                </div>

                {/* Org leaderboard */}
                {leaderboard && leaderboard.entries.length > 1 && (
                  <LeaderboardStrip
                    entries={leaderboard.entries}
                    currentUserId={currentUserId}
                    targetUserId={profile.user_id}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
