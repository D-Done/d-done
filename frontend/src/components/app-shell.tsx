"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Bot,
  FolderOpen,
  LayoutDashboard,
  Search,
  LogOut,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import { useDescope } from "@descope/nextjs-sdk/client";
import { getMe, logoutSession, type MeResponse } from "@/lib/api";
import { getInviteCookie, clearInviteCookie } from "@/lib/invite-cookie";
import {
  buildInviteRoute,
  ROUTE_LOGIN,
  ROUTE_LOGIN_SESSION_INVALID,
  ROUTE_PENDING_APPROVAL,
} from "@/lib/constants";
import { getNotifications, getUnreadCount, markAllRead, type AppNotification } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PastelAvatar } from "@/components/pastel-avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const SIDEBAR_OPEN_KEY = "app-shell-sidebar-open";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const descope = useDescope();
  const [globalSearch, setGlobalSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
      return raw !== null ? Boolean(JSON.parse(raw)) : true;
    } catch {
      return true;
    }
  });
  const [user, setUser] = useState<MeResponse | null | "loading">("loading");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const pendingInvite = getInviteCookie();
    if (pendingInvite) {
      clearInviteCookie();
      router.replace(buildInviteRoute(pendingInvite));
      return;
    }

    getMe().then((me) => {
      if (!me) {
        router.push(ROUTE_LOGIN_SESSION_INVALID);
        return;
      }
      if (me.approval_status !== "approved") {
        router.push(ROUTE_PENDING_APPROVAL);
        return;
      }
      setUser(me);
    });
  }, [router]);

  useEffect(() => {
    const refresh = () => {
      setNotifications(getNotifications());
      setUnreadCount(getUnreadCount());
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const setOpen = (value: boolean) => {
    setSidebarOpen(value);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  };

  async function handleSignOut() {
    try {
      await logoutSession();
    } catch {
      /* ignore */
    }
    try {
      await descope.logout();
    } catch {
      /* ignore */
    }
    router.push(ROUTE_LOGIN);
  }

  if (user === "loading" || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const authedUser = user;

  const navItems = [
    { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
    { href: "/transactions", label: "פרויקטים", icon: FolderOpen },
    { href: "/ai", label: "D-DONE AI", icon: Bot },
    { href: "/settings", label: "הגדרות", icon: Settings },
    ...(authedUser.is_admin ? [
      { href: "/admin/users", label: "ניהול משתמשים", icon: ShieldCheck },
      { href: "/admin/activity", label: "פעילות ועלויות", icon: Activity },
    ] : []),
  ];

  function submitSearch(raw: string) {
    const q = raw.trim();
    router.push(q ? `/transactions?q=${encodeURIComponent(q)}` : "/transactions");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Collapsible open={sidebarOpen} onOpenChange={setOpen} className="contents">
        <CollapsibleContent asChild>
          <aside className="fixed right-0 top-0 hidden h-screen w-72 flex-col bg-slate-950 text-slate-100 data-[state=closed]:hidden lg:flex">
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
              <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="truncate text-lg">D-Done</span>
              </Link>
              <Logo className="h-10 w-10 shrink-0 rounded-full overflow-hidden" />
            </div>

            <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
              {navItems.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : item.href === "/transactions"
                      ? pathname.startsWith("/transactions")
                      : item.href === "/settings"
                        ? pathname.startsWith("/settings")
                        : item.href === "/admin/users"
                          ? pathname.startsWith("/admin")
                          : pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors",
                      active
                        ? "bg-white/10 text-slate-50"
                        : "text-slate-300 hover:bg-white/5 hover:text-slate-100",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 opacity-90" />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-white/10 p-4">
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between gap-3 bg-transparent text-slate-100 hover:bg-white/5 hover:text-slate-50"
                  >
                    <span className="flex items-center gap-3">
                      <PastelAvatar name={authedUser.name} email={authedUser.email} size="sm" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="text-sm">{authedUser.name ?? authedUser.email}</span>
                        <span className="text-xs text-slate-300">
                          {authedUser.email}
                        </span>
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>
                      {authedUser.email}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-destructive" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                    התנתק
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>
        </CollapsibleContent>

        <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-out ${sidebarOpen ? "lg:pr-72" : ""}`}>
          <header className="sticky top-0 z-40 shrink-0 border-b bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSearch(globalSearch); }}
                  placeholder="חיפוש פרויקטים..."
                  className="h-10 rounded-2xl bg-white dark:bg-slate-800 pr-10 shadow-sm"
                />
              </div>

              <ThemeToggle />

              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-2xl relative"
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications) {
                      markAllRead();
                      setUnreadCount(0);
                    }
                  }}
                  aria-label={unreadCount > 0 ? `${unreadCount} התראות חדשות` : "התראות"}
                >
                  <Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 end-0 flex h-4 w-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
                {showNotifications && (
                  <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xl" dir="rtl">
                    <div className="border-b px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                      התראות
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">
                          אין התראות
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n) => (
                          <Link
                            key={n.id}
                            href={`/transactions/${n.projectId}`}
                            className={`block px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 last:border-b-0 ${
                              !n.read ? "bg-blue-50/50 dark:bg-blue-900/20" : ""
                            }`}
                            onClick={() => setShowNotifications(false)}
                          >
                            <p className="font-medium text-slate-700 dark:text-slate-200">{n.projectTitle}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                            <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString("he-IL")}</p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
              {children}
            </div>
          </main>
        </div>
      </Collapsible>
    </div>
  );
}
