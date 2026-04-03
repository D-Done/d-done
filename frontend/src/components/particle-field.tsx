"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  speed: number;
  color: string;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

    function resize() {
      w = canvas!.parentElement?.clientWidth ?? window.innerWidth;
      h = canvas!.parentElement?.clientHeight ?? window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    function initParticles() {
      // Calculate particle count based on screen size (roughly 1 particle per 8000 pixels)
      const numParticles = Math.floor((w * h) / 8000);
      
      particlesRef.current = Array.from({ length: numParticles }, () => {
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          baseX: Math.random() * w,
          baseY: Math.random() * h,
          vx: 0,
          vy: 0,
          size: 1.5, // Equal sized dots
          angle: Math.random() * Math.PI * 2, // Direction of drift
          speed: 0.15 + Math.random() * 0.25, // Speed of drift
          // Match the D-Done indigo/slate theme - darker colors
          color: Math.random() > 0.5 
            ? "rgba(67, 56, 202, 0.6)"    // indigo-700
            : "rgba(99, 102, 241, 0.5)"   // indigo-500
        };
      });
    }

    resize();
    initParticles();
    window.addEventListener("resize", resize);

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    
    function onMouseLeave() {
      mouseRef.current = { x: -1000, y: -1000 };
    }
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseLeave);

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        // 1. Gentle drift
        p.baseX += Math.cos(p.angle) * p.speed;
        p.baseY += Math.sin(p.angle) * p.speed;

        // Wrap around screen edges
        if (p.baseX < 0) p.baseX = w;
        if (p.baseX > w) p.baseX = 0;
        if (p.baseY < 0) p.baseY = h;
        if (p.baseY > h) p.baseY = 0;

        // 2. Mouse repulsion (shoveling effect)
        const dx = mouseRef.current.x - p.x;
        const dy = mouseRef.current.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 180; // Radius of interaction

        if (distance < maxDistance) {
          // Calculate push force based on how close the mouse is
          const forceDirectionX = dx / distance;
          const forceDirectionY = dy / distance;
          const force = (maxDistance - distance) / maxDistance;
          
          // Push away from mouse gently
          p.vx -= forceDirectionX * force * 1.2;
          p.vy -= forceDirectionY * force * 1.2;
        }

        // 3. Spring physics back to base drifting position
        p.vx += (p.baseX - p.x) * 0.008;
        p.vy += (p.baseY - p.y) * 0.008;

        // 4. Apply friction so they don't bounce forever
        p.vx *= 0.94;
        p.vy *= 0.94;

        // Update actual position
        p.x += p.vx;
        p.y += p.vy;

        // 5. Draw the dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 0 }}
    />
  );
}
