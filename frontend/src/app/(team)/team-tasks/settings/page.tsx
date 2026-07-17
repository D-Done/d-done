"use client";

import { useEffect, useState } from "react";
import { getMe, type MeResponse } from "@/lib/api";

export default function TeamSettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    getMe().then((me) => { if (me) setUser(me); });
  }, []);

  if (!user) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  return (
    <div dir="rtl" className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100 mb-6">הגדרות</h1>

      <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 dark:text-zinc-200 mb-4">פרטי חשבון</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-zinc-700/50">
            <span className="text-sm text-slate-500 dark:text-zinc-400">שם</span>
            <span className="text-sm font-medium text-slate-800 dark:text-zinc-100">{user.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-500 dark:text-zinc-400">אימייל</span>
            <span className="text-sm font-medium text-slate-800 dark:text-zinc-100">{user.email}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
