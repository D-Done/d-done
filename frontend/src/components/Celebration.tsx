"use client";

import { useEffect, useRef, useCallback } from "react";
import { CheckCircle2 } from "lucide-react";

const COLORS = ["#7c3aed", "#dcba44", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#fff"];

interface Burst {
  x: number;
  y: number;
  particles: BurstParticle[];
  startTime: number;
}

interface BurstParticle {
  angle: number;
  speed: number;
  color: string;
  size: number;
  decay: number;
}

function createBurst(x: number, y: number, now: number): Burst {
  const particles: BurstParticle[] = [];
  const count = 55 + Math.floor(Math.random() * 25);
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      speed: 3 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 3 + Math.random() * 4,
      decay: 0.91 + Math.random() * 0.04,
    });
  }
  return { x, y, particles, startTime: now };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export function Celebration({ show, taskTitle, onHide }: {
  show: boolean;
  taskTitle?: string;
  onHide: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const burstsRef = useRef<Burst[]>([]);
  const startRef = useRef<number>(0);
  const hiddenRef = useRef(false);

  const animate = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = performance.now();
    const elapsed = now - startRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Spawn bursts on a schedule
    const burstSchedule = [0, 300, 600, 900, 1200, 1600];
    const burstPositions = [
      [lerp(0.2, 0.8, Math.random()), lerp(0.15, 0.55, Math.random())],
      [lerp(0.15, 0.45, Math.random()), lerp(0.1, 0.4, Math.random())],
      [lerp(0.55, 0.85, Math.random()), lerp(0.1, 0.4, Math.random())],
      [lerp(0.3, 0.7, Math.random()), lerp(0.2, 0.5, Math.random())],
      [lerp(0.1, 0.4, Math.random()), lerp(0.3, 0.6, Math.random())],
      [lerp(0.6, 0.9, Math.random()), lerp(0.25, 0.55, Math.random())],
    ];
    burstSchedule.forEach((t, i) => {
      if (elapsed >= t && burstsRef.current.length <= i) {
        burstsRef.current.push(
          createBurst(burstPositions[i][0] * canvas.width, burstPositions[i][1] * canvas.height, now)
        );
      }
    });

    burstsRef.current.forEach(burst => {
      const age = now - burst.startTime;
      burst.particles.forEach(p => {
        const t = age / 1000;
        const decayed = Math.pow(p.decay, age / 16);
        const x = burst.x + Math.cos(p.angle) * p.speed * decayed * (age / 16);
        const y = burst.y + Math.sin(p.angle) * p.speed * decayed * (age / 16) + 0.5 * 0.4 * t * t * 50;
        const opacity = Math.max(0, 1 - age / 1800);
        if (opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(x, y, p.size, p.size * 0.45, p.angle + age * 0.003, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    });

    if (elapsed < 3200) {
      rafRef.current = requestAnimationFrame(() => animate(canvas));
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!hiddenRef.current) { hiddenRef.current = true; onHide(); }
    }
  }, [onHide]);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    burstsRef.current = [];
    hiddenRef.current = false;
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(() => animate(canvas));
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [show, animate]);

  if (!show) return null;

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 60 }} />
      <div className="fixed inset-0 flex items-start justify-center pointer-events-none" style={{ zIndex: 61, paddingTop: "22vh" }}>
        <div
          className="flex items-center gap-4 rounded-2xl px-8 py-5 shadow-2xl"
          style={{
            background: "#fff",
            border: "2.5px solid #22c55e",
            animation: "celebIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
          <CheckCircle2 className="w-9 h-9 shrink-0" style={{ color: "#22c55e" }} />
          <div dir="rtl">
            <p className="text-xl font-bold" style={{ color: "#16a34a" }}>המשימה בוצעה!</p>
            {taskTitle && <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>{taskTitle}</p>}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes celebIn {
          from { opacity: 0; transform: scale(0.6) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}
