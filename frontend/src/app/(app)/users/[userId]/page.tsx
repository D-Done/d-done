"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, FolderOpen, User, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/* ── Reusable inner card with section header ── */
function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-zinc-700/50 dark:bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/* ── Key-value row ── */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-50 dark:border-zinc-700/50 last:border-b-0">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function TokenBattle({
  myLabel, myTotal, myOwn, myMbr, iAmWinner,
  theirLabel, theirTotal, theirOwn, theirMbr, theyWin,
  started,
}: {
  myLabel: string; myTotal: number; myOwn: number; myMbr: number; iAmWinner: boolean;
  theirLabel: string; theirTotal: number; theirOwn: number; theirMbr: number; theyWin: boolean;
  started: boolean;
}) {
  const myDisp = useCountUp(myTotal, 1400, started);
  const myOwnDisp = useCountUp(myOwn, 1200, started);
  const myMbrDisp = useCountUp(myMbr, 1300, started);
  const theirDisp = useCountUp(theirTotal, 1400, started);
  const theirOwnDisp = useCountUp(theirOwn, 1200, started);
  const theirMbrDisp = useCountUp(theirMbr, 1300, started);

  const side = (label: string, total: number, own: number, mbr: number, isWinner: boolean, isMe: boolean) => (
    <div className="flex-1 min-w-0">
      <div className={cn(
        "text-xs font-semibold mb-2",
        isMe ? "text-sky-500 dark:text-sky-400" : "text-slate-400 dark:text-zinc-500"
      )}>
        {label}
      </div>
      <div className={cn(
        "text-3xl font-black tabular-nums tracking-tight",
        isWinner ? "text-slate-900 dark:text-slate-100" : "text-slate-300 dark:text-zinc-600"
      )}>
        {fmt(total)}
      </div>
      {isWinner && (
        <span className="inline-block mt-1 text-[10px] font-bold text-amber-500 uppercase tracking-widest">מנצח</span>
      )}
      <div className="mt-3 space-y-1 text-xs text-slate-400 dark:text-zinc-500">
        <div className="flex justify-between">
          <span>פרויקטים</span>
          <span className="tabular-nums font-medium text-slate-600 dark:text-zinc-400">{fmt(own)}</span>
        </div>
        <div className="flex justify-between">
          <span>כחבר</span>
          <span className="tabular-nums font-medium text-slate-600 dark:text-zinc-400">{fmt(mbr)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 items-start">
      {side(theirLabel, theirDisp, theirOwnDisp, theirMbrDisp, theyWin, false)}
      <div className="pt-6 text-xs font-black text-slate-200 dark:text-zinc-700 shrink-0">VS</div>
      {side(myLabel, myDisp, myOwnDisp, myMbrDisp, iAmWinner, true)}
      {!iAmWinner && !theyWin && (myTotal > 0 || theirTotal > 0) && (
        <div className="pt-6 text-xs text-slate-400 shrink-0">תיקו</div>
      )}
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

  if (!error && loading) {
    return (
      <div className="mt-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 flex flex-col items-center gap-2 text-slate-400">
        <span className="text-3xl">⚠️</span>
        <span className="text-sm">לא ניתן לטעון את הפרופיל</span>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mt-2">חזרה</Button>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="space-y-6"
    >
      {/* ── Header card (matches project detail header) ── */}
      <Card className="rounded-2xl border-none bg-white dark:bg-zinc-900/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-3 px-5 py-4">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              onClick={() => router.back()}
              aria-label="חזרה"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-8 w-px bg-slate-100 dark:bg-slate-700" />
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <PastelAvatar name={profile.name} email={profile.email} size="md" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
                  {profile.name || profile.email.split("@")[0]}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Info row: 2 columns ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard icon={<User className="h-4 w-4 text-slate-400" />} title="פרטי משתמש">
          <Row label="תאריך הצטרפות" value={
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              {formatDate(profile.joined_at)}
            </span>
          } />
        </InfoCard>

        <InfoCard icon={<FolderOpen className="h-4 w-4 text-slate-400" />} title="פרויקטים">
          <Row label="סה״כ פרויקטים" value={profile.total_project_count} />
          <Row label="משותפים איתי" value={profile.shared_projects_count} />
        </InfoCard>
      </div>

      {/* ── Shared projects ── */}
      {profile.shared_project_names.length > 0 && (
        <InfoCard icon={<Users className="h-4 w-4 text-slate-400" />} title="פרויקטים משותפים">
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.shared_project_names.map((name) => (
              <span key={name}
                className="text-sm text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 px-3 py-1 rounded-full">
                {name}
              </span>
            ))}
          </div>
        </InfoCard>
      )}

      {/* ── Token battle ── */}
      <InfoCard icon={<Zap className="h-4 w-4 text-slate-400" />} title="תחרות טוקנים">
        <TokenBattle
          myLabel="אני"
          myTotal={myTotal} myOwn={myOwn} myMbr={myMbr} iAmWinner={iAmWinner}
          theirLabel={profile.name?.split(" ")[0] || profile.email.split("@")[0]}
          theirTotal={theirTotal} theirOwn={profile.own_tokens} theirMbr={profile.member_tokens} theyWin={theyWin}
          started={animStarted}
        />
      </InfoCard>

      {/* ── Leaderboard ── */}
      {leaderboard && leaderboard.entries.length > 1 && (
        <InfoCard icon={<span className="text-sm leading-none">🏆</span>} title="דירוג ארגון">
          <div className="divide-y divide-slate-50 dark:divide-zinc-700/50">
            {leaderboard.entries.slice(0, 6).map((entry) => {
              const isMe = entry.user_id === currentUserId;
              const isTarget = entry.user_id === profile.user_id;
              const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
              return (
                <div key={entry.user_id} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-center text-xs text-slate-300 dark:text-zinc-600 shrink-0">
                    {medals[entry.rank] ?? <span className="font-semibold text-slate-400">{entry.rank}</span>}
                  </span>
                  <span className={cn(
                    "flex-1 truncate text-sm font-medium",
                    isMe ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-200",
                    isTarget && !isMe && "font-semibold text-slate-900 dark:text-slate-100"
                  )}>
                    {entry.name || entry.email.split("@")[0]}
                    {isMe && <span className="text-xs font-normal text-slate-400 mr-1">(אני)</span>}
                  </span>
                  <span className="tabular-nums text-sm font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    {fmt(entry.total_tokens)}
                  </span>
                </div>
              );
            })}
          </div>
        </InfoCard>
      )}
    </motion.div>
  );
}
