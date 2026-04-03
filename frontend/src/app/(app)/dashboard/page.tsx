"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, FolderOpen, Loader2, FileCheck, FileText } from "lucide-react";

import * as api from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { OnboardingDialog } from "@/components/ui/onboarding-dialog";
import { ApprovalCelebration } from "@/components/approval-celebration";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [me, setMe] = useState<api.MeResponse | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch {
      setStats({
        total_projects: 0,
        completed_projects: 0,
        dd_checks_in_progress: 0,
        dd_checks_completed: 0,
        documents_scanned: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    api.getMe().then((user) => {
      if (user) {
        setUserName(user.name ?? user.email ?? null);
        setMe(user);
      }
    });
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
    <>
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
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              שלום, {userName ?? "משתמש"}!
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              הנה סקירה של הפעולות שלך
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild className="rounded-2xl">
              <Link href="/transactions/new">
                <Plus className="ml-2 h-4 w-4" />
                פרויקט חדש
              </Link>
            </Button>
          </div>
        </div>

        {/* KPI row — real metrics, no clutter */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">סה״כ פרויקטים</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                <FolderOpen className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {loading ? "—" : (stats?.total_projects ?? 0)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">בדיקות DD בהרצה</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {loading ? "—" : (stats?.dd_checks_in_progress ?? 0)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">בדיקות DD שהושלמו</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                <FileCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {loading ? "—" : (stats?.dd_checks_completed ?? 0)}
            </div>
          </div>
        </div>

        {/* Optional: documents scanned — subtle, single line */}
        {!loading && stats && stats.documents_scanned > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <FileText className="mr-1.5 inline h-4 w-4 text-slate-400 dark:text-slate-500" />
            {stats.documents_scanned} מסמכים שנסרקו בכל הפרויקטים
          </p>
        )}
      </div>
    </>
  );
}
