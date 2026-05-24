"use client";

import { useEffect, useRef } from "react";

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Orbs — aubergine/gold palette
    const orbs = [
      { x: 0.15, y: 0.20, r: 0.45, color: "rgba(212,168,67,0.10)",  vx: 0.00012, vy: 0.00008 },
      { x: 0.80, y: 0.75, r: 0.40, color: "rgba(232,180,162,0.08)", vx: -0.00010, vy: -0.00007 },
      { x: 0.50, y: 0.50, r: 0.30, color: "rgba(212,168,67,0.06)",  vx: 0.00007,  vy: 0.00011 },
      { x: 0.25, y: 0.80, r: 0.25, color: "rgba(196,122,90,0.07)",  vx: -0.00008, vy: 0.00009 },
    ];

    let t = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      for (const orb of orbs) {
        // Drift with a gentle sine offset
        const px = ((orb.x + Math.sin(t * orb.vx * 6000) * 0.12) % 1) * w;
        const py = ((orb.y + Math.cos(t * orb.vy * 6000) * 0.10) % 1) * h;
        const radius = orb.r * Math.min(w, h);

        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      t++;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
