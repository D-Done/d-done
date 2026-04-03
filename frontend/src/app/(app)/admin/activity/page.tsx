"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Coins, FileCheck, Loader2, Users } from "lucide-react";

import { PastelAvatar } from "@/components/pastel-avatar";
import { adminGetActivity, getMe, type UserActivityRow, type ActivityResponse } from "@/lib/api";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function AdminActivityPage() {
  const router = useRouter();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetActivity();
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe().then((me) => {
      if (!me || !me.is_admin) { router.replace("/dashboard"); return; }
      setIsAdmin(true);
    });
  }, [router]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  if (!isAdmin || loading) {
    return (
      <>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const totals = data?.totals ?? {};

  return (
    <>
      <div className="flex flex-col gap-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">פעילות משתמשים</h1>
          <p className="mt-1 text-sm text-slate-500">מעקב אחר שימוש ועלויות מודלי AI</p>
        </div>

        {/* Summary KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "משתמשים", value: totals.total_users ?? 0, icon: Users, color: "bg-violet-50 text-violet-600" },
            { label: "בדיקות DD", value: totals.total_dd_checks ?? 0, icon: FileCheck, color: "bg-emerald-50 text-emerald-600" },
            { label: "טוקנים (קלט)", value: formatTokens(totals.total_prompt_tokens ?? 0), icon: Activity, color: "bg-sky-50 text-sky-600" },
            { label: "טוקנים (סה״כ)", value: formatTokens(totals.total_tokens ?? 0), icon: Coins, color: "bg-amber-50 text-amber-600" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border bg-white dark:bg-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">{kpi.label}</span>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${kpi.color}`}>
                  <kpi.icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Activity table */}
        <div className="overflow-x-auto rounded-xl border bg-white dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-right">
                <th className="px-4 py-3 font-medium text-muted-foreground">משתמש</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">פרויקטים</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">בדיקות DD</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">טוקנים (קלט)</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">טוקנים (פלט)</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">סה״כ טוקנים</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">פעילות אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.user_id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PastelAvatar name={u.name} email={u.email} size="sm" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{u.name || "—"}</span>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.project_count}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.dd_check_count}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTokens(u.total_prompt_tokens)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTokens(u.total_completion_tokens)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{formatTokens(u.total_tokens)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.last_active ? new Date(u.last_active).toLocaleDateString("he-IL") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
