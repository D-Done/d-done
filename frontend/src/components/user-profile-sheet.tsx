"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Trophy, Zap, Users, FolderOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PastelAvatar } from "@/components/pastel-avatar";
import * as api from "@/lib/api";
import type { UserProfileData, LeaderboardEntry, LeaderboardResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---- Animated counter ----
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

// ---- Token battle card ----
function TokenCard({
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
    <div
      className={cn(
        "relative flex-1 rounded-2xl p-4 border transition-all",
        isWinner
          ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-700 shadow-md"
          : "border-slate-200 bg-slate-50/60 dark:bg-slate-800/40 dark:border-slate-700"
      )}
    >
      {isWinner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full shadow whitespace-nowrap">
            👑 מנצח
          </span>
        </div>
      )}

      <div className="text-center mb-3">
        <span className={cn("text-xs font-semibold", isMe ? "text-sky-600 dark:text-sky-400" : "text-slate-600 dark:text-slate-400")}>
          {label}
        </span>
      </div>

      <div className="text-center mb-4">
        <motion.span
          key={totDisp}
          className={cn(
            "text-3xl font-black tabular-nums tracking-tight block",
            isWinner ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"
          )}
        >
          {fmt(totDisp)}
        </motion.span>
        <div className="text-[10px] text-slate-400 mt-0.5">טוקנים סה"כ</div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            <Zap className="h-3 w-3 text-sky-400" /> פרויקטים שלי
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{fmt(ownDisp)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            <Users className="h-3 w-3 text-violet-400" /> כחבר
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{fmt(mbrDisp)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Leaderboard strip ----
function LeaderboardStrip({
  entries,
  currentUserId,
  targetUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
  targetUserId: string;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-1.5 mb-2">
        <Trophy className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">דירוג ארגון</span>
      </div>
      <div className="space-y-1">
        {entries.slice(0, 6).map((entry) => {
          const isMe = entry.user_id === currentUserId;
          const isTarget = entry.user_id === targetUserId;
          const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
          return (
            <div
              key={entry.user_id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs",
                isMe && "bg-sky-50 dark:bg-sky-950/30",
                isTarget && !isMe && "bg-amber-50 dark:bg-amber-950/20"
              )}
            >
              <span className="w-5 font-bold text-center shrink-0 text-slate-400">
                {medal ?? entry.rank}
              </span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300 font-medium">
                {entry.name || entry.email.split("@")[0]}
                {isMe && <span className="text-sky-500 mr-1"> (אני)</span>}
              </span>
              <span className="tabular-nums text-slate-500 font-semibold shrink-0">
                {fmt(entry.total_tokens)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Main export ----
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
  const [animStarted, setAnimStarted] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setProfile(null);
    setLeaderboard(null);
    setAnimStarted(false);
    setLoading(true);

    Promise.all([api.getUserProfile(userId), api.getLeaderboard()])
      .then(([prof, lb]) => {
        setProfile(prof);
        setLeaderboard(lb);
        setTimeout(() => setAnimStarted(true), 350);
      })
      .catch(() => {})
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
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="sr-only">פרופיל משתמש</SheetTitle>
        </SheetHeader>

        <AnimatePresence mode="wait">
          {loading && !profile && (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-40"
            >
              <div className="h-6 w-6 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            </motion.div>
          )}

          {profile && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Header */}
              <div className="flex items-center gap-4">
                <PastelAvatar name={profile.name} email={profile.email} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                    {profile.name || profile.email.split("@")[0]}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <CalendarDays className="h-3 w-3" />
                    <span>הצטרף {formatDate(profile.joined_at)}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-center">
                  <FolderOpen className="h-4 w-4 text-sky-400 mx-auto mb-1" />
                  <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{profile.total_project_count}</div>
                  <div className="text-[10px] text-slate-400">פרויקטים סה"כ</div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-center">
                  <Users className="h-4 w-4 text-violet-400 mx-auto mb-1" />
                  <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{profile.shared_projects_count}</div>
                  <div className="text-[10px] text-slate-400">פרויקטים משותפים</div>
                </div>
              </div>

              {/* Shared project tags */}
              {profile.shared_project_names.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">פרויקטים משותפים</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.shared_project_names.map((name) => (
                      <span
                        key={name}
                        className="inline-block bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs px-2 py-0.5 rounded-full"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Token battle */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">תחרות טוקנים</span>
                </div>
                <div className="flex gap-3 items-stretch">
                  <TokenCard
                    label="אני"
                    ownTokens={myOwn}
                    memberTokens={myMbr}
                    isWinner={iAmWinner}
                    isMe={true}
                    started={animStarted}
                  />
                  <div className="flex items-center justify-center text-xl font-black text-slate-300 dark:text-slate-600 shrink-0 select-none">
                    vs
                  </div>
                  <TokenCard
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
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
