"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { PastelAvatar } from "@/components/pastel-avatar";
import * as api from "@/lib/api";
import type { UserProfileData, LeaderboardResponse } from "@/lib/types";
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
    year: "numeric", month: "long", day: "numeric",
  });
}

const FADE_UP = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay: i * 0.07 },
  }),
};

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    Promise.all([api.getUserProfile(userId), api.getLeaderboard()])
      .then(([prof, lb]) => {
        setProfile(prof);
        setLeaderboard(lb);
        setTimeout(() => setStarted(true), 400);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  const currentUserId = leaderboard?.current_user_id ?? "";
  const myEntry = leaderboard?.entries.find((e) => e.user_id === currentUserId);
  const myOwn = myEntry?.own_tokens ?? 0;
  const myMbr = myEntry?.member_tokens ?? 0;
  const myTotal = myOwn + myMbr;
  const theirTotal = profile?.total_tokens ?? 0;
  const iAmWinner = myTotal > theirTotal;
  const theyWin = theirTotal > myTotal;

  const theirOwnDisp = useCountUp(profile?.own_tokens ?? 0, 1200, started);
  const theirMbrDisp = useCountUp(profile?.member_tokens ?? 0, 1300, started);
  const theirTotalDisp = useCountUp(theirTotal, 1400, started);
  const myOwnDisp = useCountUp(myOwn, 1200, started);
  const myMbrDisp = useCountUp(myMbr, 1300, started);
  const myTotalDisp = useCountUp(myTotal, 1400, started);

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ─── Dark hero ─────────────────────────────────────── */}
      <div className="bg-zinc-950 px-6 pt-5 pb-16">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          חזרה
        </button>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-16 gap-2 text-zinc-600">
            <span className="text-2xl">⚠️</span>
            <span className="text-sm">שגיאה בטעינת הפרופיל</span>
          </div>
        )}

        {profile && (
          <motion.div
            variants={FADE_UP} initial="hidden" animate="show"
            className="mt-8 max-w-xl mx-auto flex flex-col items-center text-center gap-3"
          >
            <PastelAvatar name={profile.name} email={profile.email} size="lg"
              className="h-20 w-20 text-2xl ring-2 ring-white/10" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-100 mt-1">
                {profile.name || profile.email.split("@")[0]}
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">{profile.email}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <CalendarDays className="h-3 w-3" />
              הצטרף {formatDate(profile.joined_at)}
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-8 text-center">
              <div>
                <div className="text-2xl font-black text-zinc-100">{profile.total_project_count}</div>
                <div className="text-xs text-zinc-600 mt-0.5">פרויקטים</div>
              </div>
              <div className="h-6 w-px bg-zinc-800" />
              <div>
                <div className="text-2xl font-black text-zinc-100">{profile.shared_projects_count}</div>
                <div className="text-xs text-zinc-600 mt-0.5">משותפים איתי</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── Content ───────────────────────────────────────── */}
      {profile && (
        <div className="max-w-xl mx-auto px-6 -mt-6 pb-20">

          {/* Shared project tags */}
          {profile.shared_project_names.length > 0 && (
            <motion.div custom={0} variants={FADE_UP} initial="hidden" animate="show"
              className="bg-white dark:bg-zinc-900/80 rounded-2xl shadow-sm px-6 py-5 mb-4 border border-slate-100 dark:border-zinc-800/60">
              <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wide mb-3">
                פרויקטים משותפים
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.shared_project_names.map((name) => (
                  <span key={name}
                    className="text-sm text-slate-700 dark:text-zinc-200 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 px-3 py-1 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Token battle */}
          <motion.div custom={1} variants={FADE_UP} initial="hidden" animate="show"
            className="bg-white dark:bg-zinc-900/80 rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800/60 mb-4 overflow-hidden">
            <div className="px-6 pt-5 pb-1">
              <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wide">
                תחרות טוקנים
              </p>
            </div>
            <div className="flex">
              {/* Their side */}
              <div className={cn(
                "flex-1 flex flex-col items-center py-6 px-4 transition-colors",
                theyWin ? "bg-zinc-950 dark:bg-zinc-900" : ""
              )}>
                <span className={cn("text-xs font-semibold mb-2 uppercase tracking-widest",
                  theyWin ? "text-zinc-400" : "text-slate-300 dark:text-zinc-700")}>
                  {profile.name?.split(" ")[0] || profile.email.split("@")[0]}
                </span>
                <span className={cn("text-4xl font-black tabular-nums tracking-tight",
                  theyWin ? "text-zinc-100" : "text-slate-200 dark:text-zinc-700")}>
                  {fmt(theirTotalDisp)}
                </span>
                {theyWin
                  ? <span className="mt-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-widest">מנצח</span>
                  : <span className="mt-1.5 text-[10px] opacity-0 select-none">–</span>}
                <div className={cn("mt-4 space-y-1 text-xs w-full max-w-[120px]",
                  theyWin ? "text-zinc-600" : "text-slate-200 dark:text-zinc-700")}>
                  <div className="flex justify-between">
                    <span>פרויקטים</span>
                    <span className={cn("tabular-nums font-semibold", theyWin ? "text-zinc-400" : "text-slate-200 dark:text-zinc-700")}>{fmt(theirOwnDisp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>כחבר</span>
                    <span className={cn("tabular-nums font-semibold", theyWin ? "text-zinc-400" : "text-slate-200 dark:text-zinc-700")}>{fmt(theirMbrDisp)}</span>
                  </div>
                </div>
              </div>

              {/* VS */}
              <div className="flex items-center justify-center px-3">
                <span className="text-xs font-black text-slate-200 dark:text-zinc-700">VS</span>
              </div>

              {/* My side */}
              <div className={cn(
                "flex-1 flex flex-col items-center py-6 px-4 transition-colors",
                iAmWinner ? "bg-zinc-950 dark:bg-zinc-900" : ""
              )}>
                <span className={cn("text-xs font-semibold mb-2 uppercase tracking-widest",
                  iAmWinner ? "text-sky-400" : "text-slate-300 dark:text-zinc-700")}>
                  אני
                </span>
                <span className={cn("text-4xl font-black tabular-nums tracking-tight",
                  iAmWinner ? "text-zinc-100" : "text-slate-200 dark:text-zinc-700")}>
                  {fmt(myTotalDisp)}
                </span>
                {iAmWinner
                  ? <span className="mt-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-widest">מנצח</span>
                  : <span className="mt-1.5 text-[10px] opacity-0 select-none">–</span>}
                <div className={cn("mt-4 space-y-1 text-xs w-full max-w-[120px]",
                  iAmWinner ? "text-zinc-600" : "text-slate-200 dark:text-zinc-700")}>
                  <div className="flex justify-between">
                    <span>פרויקטים</span>
                    <span className={cn("tabular-nums font-semibold", iAmWinner ? "text-zinc-400" : "text-slate-200 dark:text-zinc-700")}>{fmt(myOwnDisp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>כחבר</span>
                    <span className={cn("tabular-nums font-semibold", iAmWinner ? "text-zinc-400" : "text-slate-200 dark:text-zinc-700")}>{fmt(myMbrDisp)}</span>
                  </div>
                </div>
              </div>
            </div>
            {!iAmWinner && !theyWin && (myTotal > 0 || theirTotal > 0) && (
              <div className="pb-4 text-center text-xs text-slate-400">🤝 תיקו</div>
            )}
          </motion.div>

          {/* Leaderboard */}
          {leaderboard && leaderboard.entries.length > 1 && (
            <motion.div custom={2} variants={FADE_UP} initial="hidden" animate="show"
              className="bg-white dark:bg-zinc-900/80 rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800/60 px-6 py-5">
              <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wide mb-4">
                דירוג ארגון
              </p>
              <div className="space-y-0">
                {leaderboard.entries.slice(0, 6).map((entry, idx, arr) => {
                  const isMe = entry.user_id === currentUserId;
                  const isTarget = entry.user_id === profile.user_id;
                  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
                  const isLast = idx === arr.slice(0, 6).length - 1;
                  return (
                    <div key={entry.user_id}
                      className={cn(
                        "flex items-center gap-3 py-2.5 text-sm",
                        !isLast && "border-b border-slate-50 dark:border-zinc-800/40"
                      )}>
                      <span className="w-5 text-center text-xs shrink-0 text-slate-300 dark:text-zinc-600">
                        {medals[entry.rank] ?? <span className="font-semibold">{entry.rank}</span>}
                      </span>
                      <span className={cn("flex-1 truncate font-medium",
                        isMe ? "text-sky-500 dark:text-sky-400" : "text-slate-700 dark:text-zinc-200",
                        isTarget && !isMe && "font-semibold text-slate-900 dark:text-zinc-100"
                      )}>
                        {entry.name || entry.email.split("@")[0]}
                        {isMe && <span className="text-xs font-normal text-slate-400 mr-1">(אני)</span>}
                      </span>
                      <span className="tabular-nums font-semibold text-slate-500 dark:text-zinc-400 shrink-0">
                        {fmt(entry.total_tokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
