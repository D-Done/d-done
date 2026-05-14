"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, User } from "lucide-react";
import { getOrganizationUsers, type OrganizationUser } from "@/lib/api";

interface Props {
  onSelect: (user: OrganizationUser) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function UserSearchInput({ onSelect, placeholder = "שם או מייל...", disabled, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await getOrganizationUsers(q.trim());
      setResults(res);
      setOpen(res.length > 0);
      setActiveIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(u: OrganizationUser) {
    onSelect(u);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        {loading && (
          <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
        )}
        <input
          autoFocus={autoFocus}
          disabled={disabled}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          dir="auto"
          className="w-full rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 py-2 pr-8 pl-8 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 disabled:opacity-50 transition"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 shadow-lg overflow-hidden">
          {results.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(u)}
              className={[
                "w-full flex items-center gap-3 px-3 py-2.5 text-right transition-colors",
                i === activeIndex
                  ? "bg-indigo-50 dark:bg-indigo-500/10"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800/70 text-slate-500">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                {u.name && (
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
