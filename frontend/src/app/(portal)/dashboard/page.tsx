"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FolderOpen, ListTodo, ChevronLeft } from "lucide-react";

import * as api from "@/lib/api";
import { OnboardingDialog } from "@/components/ui/onboarding-dialog";
import { ApprovalCelebration } from "@/components/approval-celebration";

const TEAM_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function checkTeamMember(): Promise<boolean> {
  try {
    const res = await fetch(`${TEAM_API}/team/me`, { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [userName, setUserName] = useState<string | null>(null);
  const [me, setMe] = useState<api.MeResponse | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isTeamMember, setIsTeamMember] = useState<boolean | null>(null);

  useEffect(() => {
    api.getMe().then((user) => {
      if (user) {
        setUserName(user.name ?? user.email ?? null);
        setMe(user);
      }
    });
    checkTeamMember().then(setIsTeamMember);
  }, []);

  useEffect(() => {
    if (searchParams.get("celebrate") === "1") {
      setShowCelebration(true);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  const needsProfile = me && (!me.name?.trim() || !me.team?.trim());
  const showOnboarding = me && !me.has_completed_onboarding && !showCelebration;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {showCelebration && (
        <ApprovalCelebration
          userName={userName}
          onComplete={() => setShowCelebration(false)}
        />
      )}
      {showOnboarding && (
        <OnboardingDialog
          defaultOpen={true}
          profile={
            needsProfile
              ? {
                  name: me?.name ?? "",
                  team: me?.team ?? "",
                  onProfileUpdate: async (name, team) => {
                    await api.updateProfile({ name, team });
                    const updated = await api.getMe();
                    if (updated) {
                      setMe(updated);
                      setUserName(updated.name ?? updated.email ?? null);
                    }
                  },
                }
              : undefined
          }
          onComplete={async () => {
            await api.completeOnboarding();
            setMe((prev) =>
              prev ? { ...prev, has_completed_onboarding: true } : null,
            );
          }}
        />
      )}
      <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-4" dir="rtl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            שלום, {userName ?? "משתמש"}!
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">לאן תרצה להמשיך?</p>
        </div>

        <div className={`grid gap-6 w-full max-w-2xl ${isTeamMember ? "max-w-sm" : "sm:grid-cols-2"}`}>
          {!isTeamMember && (
            <Link
              href="/transactions"
              className="group flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 p-8 shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition-all"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                <FolderOpen className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">D-Done</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ניהול פרויקטים ובדיקות נאותות</p>
              </div>
              <ChevronLeft className="h-5 w-5 text-slate-300 group-hover:text-violet-500 transition-colors mt-auto" />
            </Link>
          )}

          <Link
            href="/team-tasks"
            className="group flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 p-8 shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition-all"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
              <ListTodo className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">מעקב משימות</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ניהול משימות פנימי לצוות</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 group-hover:text-violet-500 transition-colors mt-auto" />
          </Link>
        </div>
      </div>
    </div>
  );
}
