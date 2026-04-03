"use client";

import { useEffect, useRef } from "react";

const CW = 340;
const CH = 270;
const CX = CW / 2;
const CY = CH / 2 + 30;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function HeroRobot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: CW / 2, y: CH / 2 });
  const robotRef = useRef({
    headAngle: 0,
    eyeX: 0,
    eyeY: 0,
    blinking: false,
    blinkT: 0,
    lastBlink: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    canvas.width = CW;
    canvas.height = CH;

    const mouse = mouseRef.current;
    const robot = robotRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * (CW / rect.width);
      mouse.y = (e.clientY - rect.top) * (CH / rect.height);
    };
    window.addEventListener("mousemove", handleMouseMove);

    const particles = Array.from({ length: 28 }, () => ({
      x: Math.random() * CW,
      y: Math.random() * CH,
      r: Math.random() * 1.4 + 0.3,
      vy: -(Math.random() * 0.35 + 0.08),
      alpha: Math.random() * 0.45 + 0.12,
      phase: Math.random() * Math.PI * 2,
    }));

    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect === "function") {
        (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    };
    const gl = (color: string, blur: number) => {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
    };
    const ng = () => {
      ctx.shadowBlur = 0;
    };

    const S = 0.62;

    function drawBackground() {
      ctx.clearRect(0, 0, CW, CH);
      const grd = ctx.createRadialGradient(CX, CY - 20, 10, CX, CY - 20, 150);
      grd.addColorStop(0, "rgba(79,111,255,0.08)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, CW, CH);
      ctx.save();
      ctx.strokeStyle = "rgba(0,120,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < CW; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CH);
        ctx.stroke();
      }
      for (let y = 0; y < CH; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CW, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawParticles(t: number) {
      particles.forEach((p) => {
        p.y += p.vy;
        if (p.y < -4) p.y = CH + 4;
        const a = p.alpha * (0.4 + 0.6 * Math.sin(t * 0.0015 + p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,190,255,${a})`;
        ctx.fill();
      });
    }

    function drawRobot(t: number) {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.scale(S, S);

      const rx = 0,
        ry = 0;
      const breathY = Math.sin(t * 0.0018) * 4;

      const gnd = ctx.createRadialGradient(0, 130, 0, 0, 130, 90);
      gnd.addColorStop(0, "rgba(0,140,255,0.18)");
      gnd.addColorStop(1, "rgba(0,140,255,0)");
      ctx.fillStyle = gnd;
      ctx.beginPath();
      ctx.ellipse(0, 130, 90, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      const legW = 30,
        legH = 60;
      const legTop = ry + 52 + breathY;
      [-28, 28].forEach((ox) => {
        ctx.save();
        rr(rx + ox - legW / 2, legTop, legW, legH, 8);
        const lg = ctx.createLinearGradient(rx + ox - legW / 2, 0, rx + ox + legW / 2, 0);
        lg.addColorStop(0, "#2e5f90");
        lg.addColorStop(1, "#4a8fc0");
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = "#6ab0e0";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        rr(rx + ox - legW / 2 - 6, legTop + legH - 4, legW + 12, 18, 6);
        ctx.fillStyle = "#1e4070";
        ctx.fill();
        ctx.strokeStyle = "#5a9dd0";
        ctx.stroke();
        ctx.restore();
      });

      const bW = 120,
        bH = 100;
      const bX = rx - bW / 2,
        bY = ry - bH / 2 + breathY;
      ctx.save();
      rr(bX, bY, bW, bH, 14);
      const bodG = ctx.createLinearGradient(bX, bY, bX + bW, bY + bH);
      bodG.addColorStop(0, "#5a8ec0");
      bodG.addColorStop(0.5, "#4a7eb0");
      bodG.addColorStop(1, "#2a5e8a");
      ctx.fillStyle = bodG;
      gl("#3a8fff", 18);
      ctx.fill();
      ng();
      ctx.strokeStyle = "#7ac4f0";
      ctx.lineWidth = 2;
      ctx.stroke();
      rr(bX + 14, bY + 14, bW - 28, bH - 28, 7);
      ctx.strokeStyle = "rgba(120,200,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      const pulse = 0.65 + 0.35 * Math.sin(t * 0.0025);
      ctx.save();
      ctx.beginPath();
      ctx.arc(rx, ry + 8 + breathY, 16, 0, Math.PI * 2);
      const orbG = ctx.createRadialGradient(rx - 4, ry + 4 + breathY, 2, rx, ry + 8 + breathY, 16);
      orbG.addColorStop(0, `rgba(255,255,255,${pulse})`);
      orbG.addColorStop(0.3, `rgba(0,220,255,${pulse * 0.85})`);
      orbG.addColorStop(1, `rgba(0,100,200,${pulse * 0.3})`);
      ctx.fillStyle = orbG;
      gl("#00ddff", 22 * pulse);
      ctx.fill();
      ng();
      ctx.restore();

      ["#ff4444", "#ffbb00", "#44ff77"].forEach((c, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(rx - 26 + i * 14, ry - 22 + breathY, 4, 0, Math.PI * 2);
        ctx.fillStyle = c;
        gl(c, 10);
        ctx.fill();
        ng();
        ctx.restore();
      });

      const aW = 22,
        aH = 72;
      [
        { ox: -bW / 2 - aW - 4, swing: Math.sin(t * 0.0012) * 6 },
        { ox: bW / 2 + 4, swing: Math.sin(t * 0.0012 + Math.PI) * 6 },
      ].forEach(({ ox, swing }) => {
        const ax = rx + ox,
          ay = bY + 12 + swing;
        ctx.save();
        rr(ax, ay, aW, aH, 9);
        const ag = ctx.createLinearGradient(ax, 0, ax + aW, 0);
        ag.addColorStop(0, "#2e5f90");
        ag.addColorStop(1, "#5a8fc0");
        ctx.fillStyle = ag;
        ctx.fill();
        ctx.strokeStyle = "#7ac4f0";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax + aW / 2, ay + aH + 12, 13, 0, Math.PI * 2);
        ctx.fillStyle = "#3a6f9f";
        ctx.fill();
        ctx.strokeStyle = "#7ac4f0";
        ctx.stroke();
        ctx.restore();
      });

      const neckY = bY - 22 + breathY;
      ctx.save();
      rr(rx - 14, neckY, 28, 26, 5);
      ctx.fillStyle = "#2e5a88";
      ctx.fill();
      ctx.strokeStyle = "#6ab0e0";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      const headPY = neckY + 4;
      ctx.save();
      ctx.translate(rx, headPY);
      ctx.rotate(robot.headAngle);

      const hW = 104,
        hH = 84;
      rr(-hW / 2, -hH - 10, hW, hH, 16);
      const hG = ctx.createLinearGradient(-hW / 2, -hH - 10, hW / 2, 0);
      hG.addColorStop(0, "#70c0f0");
      hG.addColorStop(0.5, "#58a8d8");
      hG.addColorStop(1, "#3a80b0");
      ctx.fillStyle = hG;
      gl("rgba(0,160,255,0.5)", 22);
      ctx.fill();
      ng();
      ctx.strokeStyle = "#90d8ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      rr(-hW / 2 + 10, -hH, hW - 20, hH - 20, 8);
      ctx.strokeStyle = "rgba(150,220,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const eY = -hH / 2 - 10;
      [-24, 24].forEach((ex) => {
        const eR = 17;
        ctx.beginPath();
        ctx.arc(ex, eY, eR + 4, 0, Math.PI * 2);
        ctx.fillStyle = "#152840";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, eY, eR, 0, Math.PI * 2);
        ctx.fillStyle = "#ddeeff";
        ctx.fill();

        const iX = ex + robot.eyeX,
          iY = eY + robot.eyeY;
        ctx.beginPath();
        ctx.arc(iX, iY, 11, 0, Math.PI * 2);
        const iG = ctx.createRadialGradient(iX - 3, iY - 3, 1, iX, iY, 11);
        iG.addColorStop(0, "#66eeff");
        iG.addColorStop(0.5, "#00aacf");
        iG.addColorStop(1, "#005580");
        ctx.fillStyle = iG;
        gl("#00ddff", 12);
        ctx.fill();
        ng();

        if (!robot.blinking) {
          ctx.beginPath();
          ctx.arc(iX, iY, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = "#001020";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(iX - 4, iY - 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fill();

        if (robot.blinking) {
          const pct = Math.sin((robot.blinkT / 200) * Math.PI);
          const lidH = (eR * 2 + 4) * pct;
          ctx.save();
          ctx.beginPath();
          ctx.rect(ex - eR - 4, eY - eR - 4, (eR + 4) * 2, lidH);
          ctx.fillStyle = "#58a8d8";
          ctx.fill();
          ctx.restore();
        }
      });

      const mY = eY + 38;
      for (let i = 0; i < 5; i++) {
        const mp = 0.25 + 0.75 * Math.abs(Math.sin(t * 0.005 + i * 0.9));
        ctx.save();
        rr(-24 + i * 11, mY, 7, 13, 3);
        ctx.fillStyle = `rgba(0,210,255,${mp})`;
        gl("#00ddff", 7 * mp);
        ctx.fill();
        ng();
        ctx.restore();
      }

      const awx = Math.sin(t * 0.0038) * 9;
      const awy = -hH - 10;
      ctx.beginPath();
      ctx.moveTo(0, awy);
      ctx.lineTo(awx, awy - 36);
      ctx.strokeStyle = "#90d8ff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();

      const ap = 0.5 + 0.5 * Math.sin(t * 0.006);
      ctx.beginPath();
      ctx.arc(awx, awy - 42, 9, 0, Math.PI * 2);
      const ag2 = ctx.createRadialGradient(awx - 2, awy - 45, 1, awx, awy - 42, 9);
      ag2.addColorStop(0, `rgba(255,255,255,${ap})`);
      ag2.addColorStop(0.5, `rgba(255,100,40,${ap})`);
      ag2.addColorStop(1, "rgba(180,40,0,0.4)");
      ctx.fillStyle = ag2;
      gl("#ff6030", 18 * ap);
      ctx.fill();
      ng();

      ctx.restore();

      ctx.save();
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(0,200,255,0.3)";
      ctx.textAlign = "center";
      ctx.fillText("[ UNIT-01 | ONLINE ]", rx, ry + 155);
      ctx.restore();

      ctx.restore();
    }

    function update(t: number) {
      const localMX = (mouse.x - CX) / S;
      const localMY = (mouse.y - CY) / S;
      const ry = 0;
      const breathY = Math.sin(t * 0.0018) * 4;
      const bH = 100;
      const bY = ry - bH / 2 + breathY;
      const neckY = bY - 22 + breathY;
      const headPY = neckY + 4;
      const dx = localMX - 0;
      const dy = localMY - headPY;
      const raw = Math.atan2(dy, dx) - Math.PI / 2;
      const maxA = Math.PI / 7;
      const target = Math.max(-maxA, Math.min(maxA, raw));
      robot.headAngle = lerp(robot.headAngle, target, 0.07);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      robot.eyeX = lerp(robot.eyeX, (dx / dist) * 5, 0.1);
      robot.eyeY = lerp(robot.eyeY, (dy / dist) * 5, 0.1);
      if (!robot.blinking && t - robot.lastBlink > 2800 + Math.random() * 2500) {
        robot.blinking = true;
        robot.blinkT = 0;
        robot.lastBlink = t;
      }
      if (robot.blinking) {
        robot.blinkT += 16;
        if (robot.blinkT >= 220) robot.blinking = false;
      }
    }

    let rafId: number;
    function frame(t: number) {
      drawBackground();
      drawParticles(t);
      update(t);
      drawRobot(t);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-[340px] h-[270px]"
      width={CW}
      height={CH}
      aria-hidden
    />
  );
}
