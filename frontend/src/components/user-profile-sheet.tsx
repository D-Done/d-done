"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { PastelAvatar } from "@/components/pastel-avatar";
import * as api from "@/lib/api";
import type { UserProfileData, LeaderboardEntry, LeaderboardResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function useCountUp(target: number, duration = 1200, started: boolean) {
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

function TokenCol({
  label,
  total,
  own,
  member,
  isWinner,
  isMe,
  started,
}: {
  label: string;
  total: number;
  own: number;
  member: number;
  isWinner: boolean;
  isMe: boolean;
  started: boolean;
}) {
  const totDisp = useCountUp(total, 1400, started);
  const ownDisp = useCountUp(own, 1200, started);
  const mbrDisp = useCountUp(member, 1300, started);

  return (
    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
      <span className={cn(
        "text-xs font-medium mb-1",
        isMe ? "text-sky-500 dark:text-sky-400" : "text-slate-400 dark:text-zinc-500"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-3xl font-black tabular-nums tracking-tight",
        isWinner ? "text-zinc-900 dark:text-zinc-100" : "text-slate-400 dark:text-zinc-500"
      )}>
        {fmt(totDisp)}
      </span>
      {isWinner && (
        <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
          מנצח
        </span>
      )}
      <div className="mt-2 space-y-0.5 w-full text-xs text-slate-400 dark:text-zinc-600">
        <div className="flex justify-between">
          <span>פרויקטים</span>
          <span className="tabular-nums font-medium text-slate-500 dark:text-zinc-400">{fmt(ownDisp)}</span>
        </div>
        <div className="flex justify-between">
          <span>כחבר</span>
          <span className="tabular-nums font-medium text-slate-500 dark:text-zinc-400">{fmt(mbrDisp)}</span>
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  entry,
  isMe,
  isTarget,
  isLast,
}: {
  entry: LeaderboardEntry;
  isMe: boolean;
  isTarget: boolean;
  isLast: boolean;
}) {
  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  return (
    <div className={cn(
      "flex items-center gap-3 py-2.5 text-sm",
      !isLast && "border-b border-slate-100 dark:border-zinc-800/60"
    )}>
      <span className="w-5 text-center text-xs shrink-0 text-slate-300 dark:text-zinc-600 font-bold">
        {medals[entry.rank] ?? entry.rank}
      </span>
      <span className={cn(
        "flex-1 truncate font-medium",
        isMe ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-zinc-200",
        isTarget && !isMe && "text-zinc-900 dark:text-zinc-100 font-semibold"
      )}>
        {entry.name || entry.email.split("@")[0]}
        {isMe && <span className="text-xs font-normal text-sky-400 mr-1"> (אני)</span>}
      </span>
      <span className="tabular-nums text-xs font-semibold text-slate-400 dark:text-zinc-500 shrink-0">
        {fmt(entry.total_tokens)}
      </span>
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
        setTimeout(() => setAnimStarted(true), 250);
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
      <SheetContent
        side="right"
        className="w-full sm:max-w-sm p-0 flex flex-col bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800/60"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">פרופיל משתמש</SheetTitle>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400 p-8">
              <span className="text-3xl">⚠️</span>
              <span className="text-sm text-slate-400">לא ניתן לטעון את הפרופיל</span>
            </motion.div>
          )}

          {!error && loading && (
            <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center justify-center flex-1">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100" />
            </motion.div>
          )}

          {profile && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col flex-1 overflow-y-auto"
            >
              {/* Header */}
              <div className="px-6 pt-10 pb-6 border-b border-slate-100 dark:border-zinc-800/60">
                <button
                  onClick={() => onOpenChange(false)}
                  className="absolute top-4 end-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-4">
                  <PastelAvatar name={profile.name} email={profile.email} size="lg" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {profile.name || profile.email.split("@")[0]}
                    </h2>
                    <p className="text-sm text-slate-400 dark:text-zinc-500 truncate">{profile.email}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-300 dark:text-zinc-600 mt-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span>{formatDate(profile.joined_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Inline stats */}
                <div className="mt-5 flex gap-6">
                  <div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{profile.total_project_count}</div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">פרויקטים</div>
                  </div>
                  <div className="w-px bg-slate-100 dark:bg-zinc-800" />
                  <div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{profile.shared_projects_count}</div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">משותפים איתי</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 px-6 py-5 space-y-6">

                {/* Shared project names */}
                {profile.shared_project_names.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mb-2">פרויקטים משותפים</div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.shared_project_names.map((name) => (
                        <span key={name}
                          className="text-xs text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 px-2.5 py-0.5 rounded-full">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token battle */}
                <div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500 mb-4">תחרות טוקנים</div>
                  <div className="flex items-start gap-4">
                    <TokenCol
                      label="אני"
                      total={myTotal}
                      own={myOwn}
                      member={myMbr}
                      isWinner={iAmWinner}
                      isMe={true}
                      started={animStarted}
                    />
                    <div className="pt-8 text-xs font-semibold text-slate-200 dark:text-zinc-700 shrink-0">VS</div>
                    <TokenCol
                      label={profile.name?.split(" ")[0] || profile.email.split("@")[0]}
                      total={theirTotal}
                      own={profile.own_tokens}
                      member={profile.member_tokens}
                      isWinner={theyWin}
                      isMe={false}
                      started={animStarted}
                    />
                  </div>
                  {!iAmWinner && !theyWin && (myTotal > 0 || theirTotal > 0) && (
                    <p className="text-xs text-slate-400 mt-3 text-center">תיקו</p>
                  )}
                </div>

                {/* Leaderboard */}
                {leaderboard && leaderboard.entries.length > 1 && (
                  <div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mb-1">דירוג ארגון</div>
                    {leaderboard.entries.slice(0, 6).map((entry, idx, arr) => (
                      <LeaderboardRow
                        key={entry.user_id}
                        entry={entry}
                        isMe={entry.user_id === currentUserId}
                        isTarget={entry.user_id === profile.user_id}
                        isLast={idx === arr.slice(0, 6).length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
