"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { ListTodo, Users, Settings, LogOut, User as UserIcon } from "lucide-react";
import { useDescope } from "@descope/nextjs-sdk/client";
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

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const descope = useDescope();
  const [user, setUser] = useState<MeResponse | null | "loading">("loading");
  const [teamMe, setTeamMe] = useState<TeamMe | null>(null);

  useEffect(() => {
    getMe().then((me) => {
      if (!me) { router.push(ROUTE_LOGIN_SESSION_INVALID); return; }
      if (me.approval_status !== "approved") { router.push("/pending-approval"); return; }
      setUser(me);
    });

    fetch(`${TEAM_API}/team/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setTeamMe(data));
  }, [router]);

  async function handleSignOut() {
    try { await logoutSession(); } catch { /* ignore */ }
    try { await descope.logout(); } catch { /* ignore */ }
    router.push(ROUTE_LOGIN);
  }

  if (user === "loading" || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isAdmin = teamMe?.role === "admin";

  const navItems = [
    { href: "/team-tasks", label: "מעקב משימות", icon: ListTodo },
    ...(isAdmin ? [{ href: "/team-tasks/team", label: "מעקב משימות צוותי", icon: Users }] : []),
    { href: "/team-tasks/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="fixed top-0 right-0 hidden h-screen w-64 flex-col bg-zinc-950 text-zinc-100 lg:flex" dir="rtl">
        <div className="flex flex-col items-center justify-center py-5 border-b border-zinc-800/60 px-5">
          <Image src="/arnon-logo.png" alt="ארנון תדמור-לוי" width={120} height={60} className="object-contain" />
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = item.href === "/team-tasks"
              ? pathname === "/team-tasks"
              : pathname.startsWith(item.href + "/") || pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-slate-50"
                    : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
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
                  <PastelAvatar name={user.name} email={user.email} size="sm" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm">{user.name ?? user.email}</span>
                    <span className="text-xs text-slate-300">{user.email}</span>
                  </span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2">
                <UserIcon className="h-4 w-4" />
                <span>{user.email}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-destructive" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                התנתקות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
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
