"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { ListTodo, Users, Settings, LogOut, BarChart2, FolderOpen, FileText, Bot, Loader2, ChevronRight, X, Menu } from "lucide-react";

const API = "/api/v1";
const MIN_CHAT_WIDTH = 260;
const MAX_CHAT_WIDTH_RATIO = 0.75;
const DEFAULT_CHAT_WIDTH = 320;

type TeamUser = { id: string; name: string; email: string; role: string };
type Member = { id: string; name: string; role: string };
type ChatMsg = { role: "user" | "model"; text: string };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<TeamUser | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/team-login"); return; }
    setUser(JSON.parse(saved));
  }, [router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    fetch(`${API}/team/members`, { headers: { "x-dev-email": user.email } })
      .then((r) => r.ok ? r.json() : [])
      .then(setMembers)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (showChat) setTimeout(() => chatInputRef.current?.focus(), 300);
  }, [showChat]);

  // Drag-to-resize handlers
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    const maxWidth = window.innerWidth * MAX_CHAT_WIDTH_RATIO;
    const newWidth = Math.min(Math.max(dragStartWidth.current + delta, MIN_CHAT_WIDTH), maxWidth);
    setChatWidth(newWidth);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleSignOut() {
    localStorage.removeItem("team_user");
    router.push("/team-login");
  }

  function closeAll() { setShowMenu(false); setShowChat(false); }

  async function sendMessage(text: string) {
    if (!user || !text.trim() || sending) return;
    const userMsg: ChatMsg = { role: "user", text: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    const endpoint = user.role === "admin" ? "admin-chat" : "my-chat";
    try {
      const res = await fetch(`${API}/team/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": user.email },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "שגיאה");
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "model", text: data.reply }]);
    } catch (e: unknown) {
      setMessages((prev) => [...prev, { role: "model", text: `שגיאה: ${e instanceof Error ? e.message : "נסה שוב"}` }]);
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const lawyers = members.filter((m) => m.role !== "admin");

  const QUICK_QUESTIONS = isAdmin
    ? [
        ...lawyers.map((m) => `כמה משימות יש ל${m.name}?`),
        "מי הכי עמוס כרגע?",
        "מה המשימות שהושלמו?",
        "אילו משימות באיחור?",
        "מה המשימות שנותרו לביצוע?",
      ]
    : [
        "מה המשימות שנותרו לי לביצוע?",
        "מה הספקתי לסיים?",
        "אילו משימות יש לי להיום?",
        "אילו משימות שלי באיחור?",
        "מה יש לי השבוע?",
      ];

  const navItems = [
    { href: "/team-tasks", label: "המשימות שלי", icon: ListTodo },
    { href: "/team-tasks/projects", label: "פרויקטים", icon: FolderOpen },
    { href: "/team-tasks/summary", label: "סיכום יומי", icon: FileText },
    ...(isAdmin ? [
      { href: "/team-tasks/team", label: "משימות הצוות", icon: Users },
      { href: "/team-tasks/stats", label: "סטטיסטיקות", icon: BarChart2 },
      { href: "/team-tasks/settings", label: "הגדרות", icon: Settings },
    ] : []),
  ];

  const sidebarContent = (
    <>
      <div className="flex flex-col items-center justify-center py-5 border-b border-zinc-800/60 px-5">
        <Image src="/arnon-logo-light.png" alt="ארנון תדמור-לוי" width={180} height={180} className="object-contain" />
        <p className="mt-2 text-xs text-zinc-400 text-center">Rinat has the best team</p>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.href === "/team-tasks"
            ? pathname === "/team-tasks"
            : pathname.startsWith(item.href + "/") || pathname === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setShowMenu(false)}
              className={["flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                active ? "bg-white/10 text-slate-50" : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {item.label}
            </Link>
          );
        })}

        <button
          onClick={() => { setShowChat((v) => !v); setShowMenu(false); }}
          className={["flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors w-full text-right",
            showChat ? "bg-white/10 text-slate-50" : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
          ].join(" ")}
        >
          <Bot className="h-4 w-4 shrink-0 opacity-90" />
          עוזר AI
        </button>
      </nav>

      <div className="border-t border-zinc-800/60 p-4">
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
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex" dir="rtl">

      {/* Mobile overlays */}
      {(showMenu || showChat) && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={closeAll} />
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 right-0 left-0 z-40 h-14 flex items-center justify-between px-4 bg-zinc-950 border-b border-zinc-800/60">
        <button onClick={() => { setShowChat((v) => !v); setShowMenu(false); }}
          className={`p-2 rounded-lg transition-colors ${showChat ? "text-white" : "text-zinc-400"}`}>
          <Bot className="h-5 w-5" />
        </button>
        <Image src="/arnon-logo-light.png" alt="ארנון תדמור-לוי" width={90} height={36} className="object-contain" />
        <button onClick={() => { setShowMenu((v) => !v); setShowChat(false); }}
          className={`p-2 rounded-lg transition-colors ${showMenu ? "text-white" : "text-zinc-400"}`}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed top-0 right-0 hidden h-screen w-64 flex-col bg-zinc-950 text-zinc-100 lg:flex z-30">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar drawer (slides from right) */}
      <aside className={`fixed top-14 right-0 h-[calc(100vh-3.5rem)] w-64 flex flex-col bg-zinc-950 text-zinc-100 z-40 transition-transform duration-300 lg:hidden ${showMenu ? "translate-x-0" : "translate-x-full"}`}>
        {sidebarContent}
      </aside>

      {/* AI Chat Panel */}
      <div
        className={`fixed top-0 left-0 h-screen flex flex-col bg-zinc-900 border-r border-zinc-800 z-40 w-full sm:w-auto ${!isResizing ? "transition-transform duration-300" : ""} ${showChat ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: `${chatWidth}px` }}
      >
        {/* Drag handle — right edge, desktop only */}
        <div
          onMouseDown={startResize}
          className="absolute top-0 right-0 w-1.5 h-full z-50 cursor-col-resize hidden lg:flex items-center justify-center group"
          title="גרור לשינוי רוחב"
        >
          <div className="w-0.5 h-12 rounded-full bg-zinc-700 group-hover:bg-zinc-400 group-active:bg-yellow-400 transition-colors" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 mt-14 lg:mt-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white">עוזר AI</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} title="נקה שיחה"
                className="text-zinc-400 hover:text-white transition-colors text-xs px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500">
                נקה
              </button>
            )}
            <button onClick={() => setShowChat(false)} className="text-zinc-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-center text-zinc-500 pt-2">שאלות מהירות</p>
              <div className="flex flex-col gap-2">
                {QUICK_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-2 rounded-lg text-right leading-relaxed bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={["max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                msg.role === "user" ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-200",
              ].join(" ")}>
                {msg.text}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-end">
              <div className="rounded-xl px-3 py-2 bg-zinc-800">
                <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="p-3 border-t border-zinc-800 shrink-0">
          <div className="flex gap-2">
            <input ref={chatInputRef} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="שאל/י שאלה..." disabled={sending}
              className="flex-1 rounded-lg px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              dir="rtl" />
            <button type="submit" disabled={sending || !input.trim()}
              className="h-8 w-8 rounded-lg bg-yellow-400 flex items-center justify-center disabled:opacity-40 transition-colors shrink-0">
              <ChevronRight className="h-3 w-3 text-zinc-900" />
            </button>
          </div>
        </form>
      </div>

      {/* Main content */}
      <div
        className={`flex-1 min-w-0 overflow-x-hidden lg:pr-64 ${!isResizing ? "transition-all duration-300" : ""}`}
        style={{ paddingLeft: showChat ? `${chatWidth}px` : undefined }}
      >
        <main className="min-h-screen pt-14 lg:pt-0">
          <div className="w-full mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
