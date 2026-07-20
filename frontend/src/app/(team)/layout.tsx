"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { ListTodo, Users, Settings, LogOut, BarChart2, FolderOpen, FileText } from "lucide-react";

type TeamUser = { id: string; name: string; email: string; role: string };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<TeamUser | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/team-login"); return; }
    setUser(JSON.parse(saved));
  }, [router]);

  function handleSignOut() {
    localStorage.removeItem("team_user");
    router.push("/team-login");
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isAdmin = user.role === "admin";
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

        <div className="border-t border-zinc-800/60 p-4" dir="rtl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-white">{user.name}</p>
              <p className="text-xs truncate text-zinc-400">{user.email}</p>
            </div>
            <button onClick={handleSignOut} className="text-zinc-400 hover:text-white transition-colors shrink-0">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
