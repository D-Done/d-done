"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, FolderOpen, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
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

function TokenSide({
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
    <div className={cn(
      "flex-1 flex flex-col items-center py-6 px-4 transition-colors rounded-2xl",
      isWinner
        ? "bg-zinc-950 dark:bg-zinc-900"
        : "bg-transparent"
    )}>
      <span className={cn(
        "text-xs font-semibold mb-3 uppercase tracking-widest",
        isWinner
          ? (isMe ? "text-sky-400" : "text-zinc-400")
          : "text-slate-300 dark:text-zinc-600"
      )}>
        {label}
      </span>

      <span className={cn(
        "text-5xl font-black tabular-nums tracking-tight leading-none",
        isWinner ? "text-white" : "text-slate-300 dark:text-zinc-700"
      )}>
        {fmt(totDisp)}
      </span>

      {isWinner ? (
        <span className="mt-2 text-[10px] font-bold text-amber-400 uppercase tracking-[0.15em]">
          מנצח
        </span>
      ) : (
        <span className="mt-2 text-[10px] text-transparent select-none">–</span>
      )}

      <div className={cn(
        "mt-5 w-full space-y-2 text-xs max-w-[130px]",
        isWinner ? "text-zinc-500" : "text-slate-200 dark:text-zinc-700"
      )}>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1">
            <Zap className={cn("h-3 w-3", isWinner ? "text-sky-500" : "text-slate-300 dark:text-zinc-700")} />
            פרויקטים
          </span>
          <span className={cn("tabular-nums font-semibold", isWinner ? "text-zinc-300" : "text-slate-300 dark:text-zinc-700")}>
            {fmt(ownDisp)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1">
            <Users className={cn("h-3 w-3", isWinner ? "text-violet-400" : "text-slate-300 dark:text-zinc-700")} />
            כחבר
          </span>
          <span className={cn("tabular-nums font-semibold", isWinner ? "text-zinc-300" : "text-slate-300 dark:text-zinc-700")}>
            {fmt(mbrDisp)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [animStarted, setAnimStarted] = useState(false);

  useEffect(() => {
    Promise.all([api.getUserProfile(userId), api.getLeaderboard()])
      .then(([prof, lb]) => {
        setProfile(prof);
        setLeaderboard(lb);
        setTimeout(() => setAnimStarted(true), 300);
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

  return (
    /* Break out of the shell's px-4 py-8 container */
    <div className="-mx-4 -mt-8 sm:-mx-6 min-h-screen">

      {/* ── Dark hero ── */}
      <div className="bg-zinc-950 px-4 sm:px-6 pt-6 pb-24">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה</span>
        </button>

        {!error && loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-zinc-500">
            <span className="text-3xl">⚠️</span>
            <span className="text-sm">לא ניתן לטעון את הפרופיל</span>
          </div>
        )}

        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="mt-10 flex flex-col items-center text-center"
          >
            <PastelAvatar
              name={profile.name}
              email={profile.email}
              size="lg"
              className="h-20 w-20 text-2xl ring-4 ring-white/10"
            />
            <h1 className="mt-4 text-2xl font-bold text-zinc-100">
              {profile.name || profile.email.split("@")[0]}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{profile.email}</p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-2">
              <CalendarDays className="h-3 w-3" />
              <span>הצטרף {formatDate(profile.joined_at)}</span>
            </div>

            {/* Stat pills */}
            <div className="mt-8 flex items-center gap-10">
              <div className="text-center">
                <div className="text-3xl font-black text-zinc-100">{profile.total_project_count}</div>
                <div className="text-xs text-zinc-500 mt-1">פרויקטים</div>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
              <div className="text-center">
                <div className="text-3xl font-black text-zinc-100">{profile.shared_projects_count}</div>
                <div className="text-xs text-zinc-500 mt-1">משותפים איתי</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Cards (overlap the hero) ── */}
      {profile && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="max-w-2xl mx-auto px-4 sm:px-6 -mt-10 pb-16 space-y-4"
        >

          {/* Shared project names */}
          {profile.shared_project_names.length > 0 && (
            <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-slate-200 dark:border-zinc-700/50 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50 dark:bg-zinc-800/70">
                  <FolderOpen className="h-4 w-4 text-sky-500" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">פרויקטים משותפים</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.shared_project_names.map((name) => (
                  <span key={name}
                    className="text-sm text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 px-3 py-1 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Token battle */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-slate-200 dark:border-zinc-700/50 shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50 dark:bg-zinc-800/70">
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">תחרות טוקנים</span>
            </div>
            <div className="flex items-stretch p-3 gap-2">
              <TokenSide
                label={profile.name?.split(" ")[0] || profile.email.split("@")[0]}
                total={theirTotal}
                own={profile.own_tokens}
                member={profile.member_tokens}
                isWinner={theyWin}
                isMe={false}
                started={animStarted}
              />
              <div className="flex items-center justify-center px-2 text-xs font-black text-slate-200 dark:text-zinc-700 shrink-0">
                VS
              </div>
              <TokenSide
                label="אני"
                total={myTotal}
                own={myOwn}
                member={myMbr}
                isWinner={iAmWinner}
                isMe={true}
                started={animStarted}
              />
            </div>
            {!iAmWinner && !theyWin && (myTotal > 0 || theirTotal > 0) && (
              <div className="pb-4 text-center text-xs text-slate-400">🤝 תיקו</div>
            )}
          </div>

          {/* Leaderboard */}
          {leaderboard && leaderboard.entries.length > 1 && (
            <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-slate-200 dark:border-zinc-700/50 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800/60">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50 dark:bg-zinc-800/70">
                  <span className="text-sm">🏆</span>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">דירוג ארגון</span>
              </div>
              <div className="px-4">
                {leaderboard.entries.slice(0, 6).map((entry, idx, arr) => {
                  const isMe = entry.user_id === currentUserId;
                  const isTarget = entry.user_id === profile.user_id;
                  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
                  const isLast = idx === arr.slice(0, 6).length - 1;
                  return (
                    <div
                      key={entry.user_id}
                      className={cn(
                        "flex items-center gap-3 py-3 text-sm",
                        !isLast && "border-b border-slate-100 dark:border-zinc-800/50"
                      )}
                    >
                      <span className="w-6 text-center text-xs shrink-0 text-slate-300 dark:text-zinc-600">
                        {medals[entry.rank] ?? <span className="font-semibold">{entry.rank}</span>}
                      </span>
                      <span className={cn(
                        "flex-1 truncate font-medium",
                        isMe ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-zinc-200",
                        isTarget && !isMe && "font-semibold text-zinc-900 dark:text-zinc-100"
                      )}>
                        {entry.name || entry.email.split("@")[0]}
                        {isMe && <span className="text-xs font-normal text-sky-400 mr-1">(אני)</span>}
                      </span>
                      <span className="tabular-nums text-sm font-semibold text-slate-500 dark:text-zinc-400 shrink-0">
                        {fmt(entry.total_tokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
