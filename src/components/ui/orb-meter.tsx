"use client";

import React, { useEffect, useRef } from "react";

/**
 * OrbMeter — premium visual meter
 * Design goals:
 * - Rich glassy orb with multi-layer bloom and specular highlights
 * - Smooth energy-driven animation and tasteful motion
 * - Theme-aware via CSS var(--primary) or explicit color prop
 * - Efficient: keeps draw ops bounded; avoids heavy per-frame allocations
 */
type OrbMeterProps = {
  value: number; // 0..1 (clamped)
  label?: string;
  color?: string; // hex (#rgb/#rrggbb). Defaults to CSS var(--primary) or #ffc029
  width?: number; // CSS px
  height?: number; // CSS px
};

export default function OrbMeter({
  value,
  label,
  color,
  width = 220,
  height = 200,
}: OrbMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetLevelRef = useRef(0);
  const levelRef = useRef(0);

  // Parse hex color (#rgb or #rrggbb)
  function hexToRgbComponents(hex: string): [number, number, number] | null {
    const n = hex.trim().replace(/^#/, "");
    if (n.length === 3) {
      const r = parseInt(n[0] + n[0], 16);
      const g = parseInt(n[1] + n[1], 16);
      const b = parseInt(n[2] + n[2], 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r, g, b];
    }
    if (n.length === 6) {
      const r = parseInt(n.slice(0, 2), 16);
      const g = parseInt(n.slice(2, 4), 16);
      const b = parseInt(n.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r, g, b];
    }
    return null;
  }

  function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; }
    else if (60 <= h && h < 120) { r = x; g = c; }
    else if (120 <= h && h < 180) { g = c; b = x; }
    else if (180 <= h && h < 240) { g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  // Resolve primary color as RGB & HSL
  function resolvePrimary(): {
    rgb: [number, number, number];
    hsl: [number, number, number];
  } {
    // explicit color first
    if (typeof color === "string" && color.trim()) {
      const rgb = hexToRgbComponents(color.trim());
      if (rgb) return { rgb, hsl: rgbToHsl(rgb[0], rgb[1], rgb[2]) };
    }
    // CSS var(--primary)
    try {
      const css = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      const rgb = hexToRgbComponents(css);
      if (rgb) return { rgb, hsl: rgbToHsl(rgb[0], rgb[1], rgb[2]) };
    } catch {}
    const fallback: [number, number, number] = [255, 192, 41]; // #ffc029
    return { rgb: fallback, hsl: rgbToHsl(fallback[0], fallback[1], fallback[2]) };
  }

  function rgbStr(rgb: [number, number, number]): string {
    return `${rgb[0]},${rgb[1]},${rgb[2]}`;
  }

  // Luminance adjuster for generating glow/beam variants
  function adjustLightness(hsl: [number, number, number], delta: number): [number, number, number] {
    const [h, s, l] = hsl;
    const nl = Math.max(0, Math.min(1, l + delta));
    return hslToRgb(h, s, nl);
  }

  // Update target level on prop change
  useEffect(() => {
    const v = Math.max(0, Math.min(1, value || 0));
    targetLevelRef.current = v;
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CANVAS_WIDTH = width;
    const CANVAS_HEIGHT = height;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(CANVAS_WIDTH * dpr);
    canvas.height = Math.round(CANVAS_HEIGHT * dpr);
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    // Orb radius tuned for glassy look
    const baseR = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.28;

    const { rgb: prgb, hsl: phsl } = resolvePrimary();
    const coreRGB = prgb;
    const glowRGB = adjustLightness(phsl, +0.20);
    const deepRGB = adjustLightness(phsl, -0.12);
    const ringRGB = adjustLightness(phsl, +0.10);
    const accentRGB = adjustLightness(phsl, +0.35);

    const core = rgbStr(coreRGB);
    const glow = rgbStr(glowRGB);
    const deep = rgbStr(deepRGB);
    const ring = rgbStr(ringRGB);
    const accent = rgbStr(accentRGB);

    let last = performance.now();
    let rafId = 0;

    // Orbiters config
    const orbiters = Array.from({ length: 10 }, (_, i) => ({
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 0.8,
      radius: baseR * (0.62 + Math.random() * 0.25),
      size: 1.4 + Math.random() * 2.0,
      jitter: 0.2 + Math.random() * 0.6,
      hueShift: (i * 7) % 360,
    }));

    const render = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
      last = time;

      // Smooth envelope
      const target = targetLevelRef.current;
      const current = levelRef.current;
      const rising = target > current;
      const blend = Math.min(1, (rising ? 0.55 : 0.9) * (dt * 60));
      const energy = Math.max(0, Math.min(1, current + (target - current) * blend));
      levelRef.current = energy;

      // clear
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Subtle backdrop vignette for depth
      const vignette = ctx.createRadialGradient(cx, cy, baseR * 0.8, cx, cy, Math.max(cx, cy));
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Radius modulation & wobble
      const wobble = Math.sin(time * 0.0018) * 0.9 + Math.cos(time * 0.001) * 0.6;
      const r = baseR * (1 + energy * 0.35 + wobble * 0.02);

      // Ambient bloom glow (outer)
      const outerGlow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * (1.6 + energy * 0.3));
      outerGlow.addColorStop(0, `rgba(${glow},${0.25 + energy * 0.25})`);
      outerGlow.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();

      // Core body gradient — deep center with specular highlight
      const coreGrad = ctx.createRadialGradient(cx, cy - r * 0.22, r * 0.18, cx, cy, r);
      coreGrad.addColorStop(0, `rgba(255,255,255,${0.16 + energy * 0.12})`);
      coreGrad.addColorStop(0.55, `rgba(${core},${0.72 + energy * 0.22})`);
      coreGrad.addColorStop(1, `rgba(${deep},${0.44 + energy * 0.16})`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

      // Glass gloss overlay (top arc sheen)
      ctx.globalAlpha = 0.18 + energy * 0.06;
      const glossGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy - r * 0.3);
      glossGrad.addColorStop(0.0, "rgba(255,255,255,0.0)");
      glossGrad.addColorStop(0.5, "rgba(255,255,255,0.9)");
      glossGrad.addColorStop(1.0, "rgba(255,255,255,0.0)");
      ctx.fillStyle = glossGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.38, r * 0.85, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Inner caustics (subtle beams)
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.06 + energy * 0.06;
      for (let i = 0; i < 3; i++) {
        const ang = (time * 0.0009 + i * 2.2) % (Math.PI * 2);
        const rr = r * (0.6 + i * 0.12);
        const x1 = cx + Math.cos(ang) * rr;
        const y1 = cy + Math.sin(ang) * rr;
        const beam = ctx.createRadialGradient(x1, y1, 0, x1, y1, r * 0.5);
        beam.addColorStop(0, `rgba(${accent},0.65)`);
        beam.addColorStop(1, `rgba(${accent},0)`);
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.arc(x1, y1, r * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Energy rim ring (gradient stroke)
      const ringThick = Math.max(2, r * (0.08 + energy * 0.07));
      ctx.lineWidth = ringThick;
      const ringGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      ringGrad.addColorStop(0, `rgba(${ring},${0.2})`);
      ringGrad.addColorStop(0.5, `rgba(${ring},${0.9})`);
      ringGrad.addColorStop(1, `rgba(${ring},${0.2})`);
      ctx.strokeStyle = ringGrad;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.03 + energy * 0.06), 0, Math.PI * 2);
      ctx.stroke();

      // Arc pulse (progress around rim)
      const arcLen = Math.PI * (0.8 + energy * 1.2);
      const arcStart = (time * 0.0012 + energy * 2.2) % (Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, ringThick * 0.7);
      ctx.strokeStyle = `rgba(${accent},${0.85})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.05, arcStart, arcStart + arcLen);
      ctx.stroke();

      // Orbiters (bokeh particles orbiting)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < orbiters.length; i++) {
        const ob = orbiters[i];
        ob.phase += dt * ob.speed * (0.6 + energy * 0.8);
        const rr = ob.radius * (1 + Math.sin(time * 0.0007 + i) * 0.02);
        const ox = cx + Math.cos(ob.phase) * rr;
        const oy = cy + Math.sin(ob.phase) * (rr * 0.92);
        const size = ob.size * (1 + energy * 0.8);
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, size * 2.2);
        grad.addColorStop(0, `rgba(${accent},0.85)`);
        grad.addColorStop(1, `rgba(${accent},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, size, 0, Math.PI * 2);
        ctx.fill();

        // Twinkle line
        if ((i + Math.floor(time / 180)) % 3 === 0) {
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = `rgba(${accent},0.6)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ox - size * 2, oy);
          ctx.lineTo(ox + size * 2, oy);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // Secondary gloss crescent (bottom-right glint)
      ctx.globalAlpha = 0.12 + energy * 0.08;
      const crescent = ctx.createRadialGradient(cx + r * 0.35, cy + r * 0.35, r * 0.1, cx + r * 0.35, cy + r * 0.35, r * 0.6);
      crescent.addColorStop(0, "rgba(255,255,255,0.9)");
      crescent.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = crescent;
      ctx.beginPath(); ctx.arc(cx + r * 0.26, cy + r * 0.26, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // Micro sparkles inside (subtle)
      const sparkCount = Math.floor(3 + energy * 8);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(0.35, 0.12 + energy * 0.22);
      for (let i = 0; i < sparkCount; i++) {
        const ang = arcStart + (i / sparkCount) * Math.PI * 2 + Math.sin(time * 0.0014 + i) * 0.2;
        const rr = r * (0.3 + 0.5 * Math.random());
        const sx = cx + Math.cos(ang) * rr;
        const sy = cy + Math.sin(ang) * rr;
        const sz = Math.max(1, 1.8 + energy * 1.5);
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz);
        grad.addColorStop(0, `rgba(${accent},0.9)`);
        grad.addColorStop(1, `rgba(${accent},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      try { cancelAnimationFrame(rafId); } catch {}
    };
  }, [width, height, color]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
        className="pointer-events-none select-none"
      />
      {label ? <div className="text-xs font-medium">{label}</div> : null}
    </div>
  );
}
