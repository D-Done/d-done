"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Undo2 } from "lucide-react";

const DELAY = 5000;

export interface PendingAction {
  id: number;
  label: string;
  execute: () => void;
  revert: () => void;
}

function ProgressBar({ id }: { id: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transition = "none";
    bar.style.width = "100%";
    bar.getBoundingClientRect();
    bar.style.transition = `width ${DELAY}ms linear`;
    bar.style.width = "0%";
  }, [id]);
  return (
    <div className="h-0.5 mt-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
      <div ref={barRef} className="h-full rounded-full" style={{ background: "#dcba44" }} />
    </div>
  );
}

export function useUndo() {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const counterRef = useRef(0);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (pendingRef.current) { pendingRef.current.execute(); pendingRef.current = null; setPending(null); }
  }, []);

  const schedule = useCallback((label: string, execute: () => void, revert: () => void) => {
    flush();
    const id = ++counterRef.current;
    const action: PendingAction = { id, label, execute, revert };
    pendingRef.current = action;
    setPending(action);
    timerRef.current = setTimeout(() => {
      if (pendingRef.current?.id === id) {
        pendingRef.current.execute();
        pendingRef.current = null;
        setPending(null);
      }
      timerRef.current = null;
    }, DELAY);
  }, [flush]);

  const undo = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (pendingRef.current) { pendingRef.current.revert(); pendingRef.current = null; setPending(null); }
  }, []);

  // Flush on unmount so pending actions are never lost
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) pendingRef.current.execute();
    };
  }, []);

  return { pending, schedule, undo };
}

export function UndoToast({ pending, onUndo }: { pending: PendingAction | null; onUndo: () => void }) {
  if (!pending) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-xl px-4 py-3 shadow-2xl"
      style={{ background: "#1a0028", border: "1px solid #3d1060" }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white">{pending.label}</span>
        <button onClick={onUndo}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 hover:opacity-80 transition-opacity"
          style={{ background: "#dcba44", color: "#1a0028" }}>
          <Undo2 className="w-3 h-3" />
          בטל
        </button>
      </div>
      <ProgressBar key={pending.id} id={pending.id} />
    </div>
  );
}
