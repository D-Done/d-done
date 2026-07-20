"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { ListTodo, Users, Settings, LogOut, User as UserIcon, ShieldCheck, Scale, BarChart2, FolderOpen, FileText } from "lucide-react";
import { useDescope, useSession } from "@descope/nextjs-sdk/client";
import { getMe, logoutSession, type MeResponse } from "@/lib/api";
import { ROUTE_LOGIN, ROUTE_LOGIN_SESSION_INVALID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { PastelAvatar } from "@/components/pastel-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TEAM_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type TeamMe = { id: string; name: string; role: string; email: string };
type LoadState = "loading" | "needs_registration" | "ready";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const descope = useDescope();
  const { sessionToken } = useSession();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [teamMe, setTeamMe] = useState<TeamMe | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  useEffect(() => {
    async function init() {
      const me = await getMe();
      if (!me) { router.push(ROUTE_LOGIN_SESSION_INVALID); return; }
      setUser(me);

      const authHeaders: Record<string, string> = sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : me?.email ? { "x-dev-email": me.email } : {};
      const r = await fetch(`${TEAM_API}/team/me`, { headers: authHeaders });
      if (r.ok) {
        const tm = await r.json();
        setTeamMe(tm);
        localStorage.setItem("team_user", JSON.stringify({ id: tm.id, name: tm.name, role: tm.role, email: tm.email }));
        setLoadState("ready");
      } else if (r.status === 403) {
        const body = await r.json().catch(() => ({}));
        setLoadState(body.detail === "NOT_REGISTERED" ? "needs_registration" : "ready");
      } else {
        setLoadState("ready");
      }
    }
    init();
  }, [router]);

  async function handleRegister(role: "admin" | "lawyer") {
    setRegLoading(true);
    setRegError("");
    try {
      const authHeaders: Record<string, string> = sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : user?.email ? { "x-dev-email": user.email } : {};
      const res = await fetch(`${TEAM_API}/team/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("שגיאה בהרשמה");
      const tm = await res.json();
      setTeamMe(tm);
      localStorage.setItem("team_user", JSON.stringify({ id: tm.id, name: tm.name, role: tm.role, email: tm.email }));
      setLoadState("ready");
    } catch (e) {
      setRegError(e instanceof Error ? e.message : "שגיאה");
      setRegLoading(false);
    }
  }

  async function handleSignOut() {
    try { await logoutSession(); } catch { /* ignore */ }
    try { await descope.logout(); } catch { /* ignore */ }
    router.push(ROUTE_LOGIN);
  }

  if (loadState === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (loadState === "needs_registration" && user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Image src="/arnon-logo.png" alt="ארנון תדמור-לוי" width={180} height={67} className="object-contain mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100 mb-1">
              שלום, {user.name ?? user.email}!
            </h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm">בחר/י את התפקיד שלך במערכת</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleRegister("admin")}
              disabled={regLoading}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 text-center hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 group"
            >
              <ShieldCheck className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-zinc-100">אדמין</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">ניהול מלא של משימות הצוות</p>
              </div>
            </button>

            <button
              onClick={() => handleRegister("lawyer")}
              disabled={regLoading}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 text-center hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 group"
            >
              <Scale className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-zinc-100">עורך/ת דין</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">צפייה ועדכון המשימות שלי</p>
              </div>
            </button>
          </div>

          {regLoading && (
            <div className="flex justify-center mt-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {regError && <p className="text-center text-sm text-red-500 mt-4">{regError}</p>}
        </div>
      </div>
    );
  }

  const isAdmin = teamMe?.role === "admin";
  const navItems = [
    { href: "/team-tasks", label: "המשימות שלי", icon: ListTodo },
    ...(isAdmin ? [{ href: "/team-tasks/team", label: "משימות הצוות", icon: Users }] : []),
    { href: "/team-tasks/stats", label: "סטטיסטיקות", icon: BarChart2 },
    { href: "/team-tasks/projects", label: "פרויקטים", icon: FolderOpen },
    { href: "/team-tasks/summary", label: "סיכום יומי", icon: FileText },
    { href: "/team-tasks/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex">
      <aside className="fixed top-0 right-0 hidden h-screen w-64 flex-col bg-zinc-950 text-zinc-100 lg:flex" dir="rtl">
        <div className="flex flex-col items-center justify-center py-5 border-b border-zinc-800/60 px-5">
          <Image src="/arnon-logo.png" alt="ארנון תדמור-לוי" width={200} height={74} className="object-contain" />
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = item.href === "/team-tasks"
              ? pathname === "/team-tasks"
              : pathname.startsWith(item.href + "/") || pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={["flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                  active ? "bg-white/10 text-slate-50" : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800/60 p-4">
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between gap-3 bg-transparent text-slate-100 hover:bg-white/5 hover:text-slate-50">
                <span className="flex items-center gap-3">
                  <PastelAvatar name={user?.name} email={user?.email ?? ""} size="sm" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm">{user?.name ?? user?.email}</span>
                    <span className="text-xs text-slate-300">{user?.email}</span>
                  </span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2">
                <UserIcon className="h-4 w-4" />
                <span>{user?.email}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-destructive" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                התנתקות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 lg:pr-64">
        <main className="min-h-screen">
          <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
