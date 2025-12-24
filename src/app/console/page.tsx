"use client";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { WorldRegionMap } from "@/components/ui/world-region-map";
import MediaPlayerPanel from "./media-player";
import { PublicSpacePanel } from "./public-space-panel";
import HostModePanel from "./host-mode-panel";
import OrbMeter from "@/components/ui/orb-meter";
import { addUsageSeconds, getUsedSecondsToday } from "@/lib/usage";
import ConnectCrmPanel from "./connect-crm-panel";
import {
  getGroupForLanguage,
  GROUPS,
  getLanguagesForRegion,
} from "@/lib/master-langs";
import { fetchEthRates } from "@/lib/eth";
const VOICE_OPTIONS = [
  { label: "Alloy", value: "alloy" },
  { label: "Ash", value: "ash" },
  { label: "Ballad", value: "ballad" },
  { label: "Cedar", value: "cedar" },
  { label: "Coral", value: "coral" },
  { label: "Echo", value: "echo" },
  { label: "Marin", value: "marin" },
  { label: "Sage", value: "sage" },
  { label: "Shimmer", value: "shimmer" },
  { label: "Verse", value: "verse" },
] as const;
type VoiceName = (typeof VOICE_OPTIONS)[number]["value"];
type ConsolePresetSettings = {
  voice: VoiceName;
  language: string;
  otherLanguage: string;
  nonGeoOption?: string;
  platform: string;
  agentRole: string;
  hostName: string;
  guestList: string[];
  sessionDomain: string;
  rollDomain: string;
  rollTheme: string;
  rollArchetype: string;
  rollTone: string;
  rollStyle: string;
  rollQuirk: string;
  rollFormatting: string;
  rollLength: string;
  rollTopics: string[];
  maxResponse: number;
  temperature: number;
  vadThreshold: number;
  vadPrefixMs: number;
  vadSilenceMs: number;
  spaceUrl: string;
  spacePublic: boolean;
  currency: string;
  systemPrompt: string;
  selectedInputId: string;
  domainLocked: string;
};
type ConsolePreset = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ConsolePresetSettings;
};
const PRESET_STORAGE_KEY = "cb:consolePresets";
const PRESET_ACTIVE_KEY = "cb:consolePresetActive";
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTouch = /mobile|android|iphone|ipad|ipod/.test(ua);
    const isNarrow = window.innerWidth < 1024;
    setMobile(isTouch || isNarrow);
    const onResize = () => setMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}
// Currency support (aligned with Pricing page)
const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "INR", label: "Indian Rupee" },
  { code: "NGN", label: "Nigerian Naira" },
] as const;
function flagUrl(code: string): string {
  const map: Record<string, string> = {
    USD: "us",
    EUR: "eu",
    GBP: "gb",
    JPY: "jp",
    CAD: "ca",
    AUD: "au",
    INR: "in",
    NGN: "ng",
  };
  const cc = map[code] || code.toLowerCase();
  return `https://flagcdn.com/48x36/${cc}.png`;
}
type BowlVariant = "red" | "blue";
const BOWL_VARIANTS: Record<
  BowlVariant,
  { accent: string; back: string; front: string }
> = {
  red: {
    accent: "#4dd9cf",
    back: "/redbowlback.png",
    front: "/redbowlfront.png",
  },
  blue: {
    accent: "#29B6F5",
    back: "/bluebowlback.png",
    front: "/bluebowlfront.png",
  },
};

const fallbackAccent: [number, number, number] = [120, 231, 255];

type AccentPalette = {
  base: string;
  glow: string;
  beam: string;
  highlight: string;
};

function hexToRgbComponents(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    if ([r, g, b].some((component) => Number.isNaN(component))) return null;
    return [r, g, b];
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((component) => Number.isNaN(component))) return null;
    return [r, g, b];
  }
  return null;
}

function mixWithWhite(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  const clampAmount = Math.max(0, Math.min(1, amount));
  const [r, g, b] = rgb;
  return [
    Math.round(r + (255 - r) * clampAmount),
    Math.round(g + (255 - g) * clampAmount),
    Math.round(b + (255 - b) * clampAmount),
  ];
}

function rgbComponentsToString(rgb: [number, number, number]): string {
  return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
}

function createAccentPalette(hex: string): AccentPalette {
  const base = hexToRgbComponents(hex) || fallbackAccent;
  return {
    base: rgbComponentsToString(base),
    glow: rgbComponentsToString(mixWithWhite(base, 0.28)),
    beam: rgbComponentsToString(mixWithWhite(base, 0.48)),
    highlight: rgbComponentsToString(mixWithWhite(base, 0.66)),
  };
}

const BONE_BASE_TEXTURES = [
  "/bone1.png",
  "/bone2.png",
  "/bone3.png",
  "/bone4.png",
  "/bone5.png",
  "/bone6.png",
  "/bone7.png",
  "/bone8.png",
  "/bone9.png",
];

type BoneTextureDescriptor = {
  src: string;
  mirrorX?: boolean;
  mirrorY?: boolean;
  angleOffset?: number;
};

const BONE_TEXTURE_SOURCES: BoneTextureDescriptor[] = BONE_BASE_TEXTURES.flatMap((src) => [
  { src },
  { src, mirrorX: true },
  { src, mirrorY: true },
  { src, mirrorX: true, mirrorY: true },
  { src, angleOffset: Math.PI * 0.5 },
  { src, mirrorX: true, angleOffset: Math.PI * 0.5 },
  { src, mirrorY: true, angleOffset: Math.PI * 0.5 },
  { src, mirrorX: true, mirrorY: true, angleOffset: Math.PI * 0.5 },
  { src, angleOffset: Math.PI },
  { src, mirrorX: true, angleOffset: Math.PI },
]);


type BoneMaskSegment = {
  offset: number;
  lateral: number;
  radius: number;
  weight: number;
};
type BoneMaskOutlinePoint = {
  x: number;
  y: number;
};
type BoneMask = {
  centreOffsetX: number;
  centreOffsetY: number;
  axisX: number;
  axisY: number;
  perpX: number;
  perpY: number;
  length: number;
  segments: BoneMaskSegment[];
  outline: BoneMaskOutlinePoint[];
  area: number;
  inertia: number;
  maxRadius: number;
};
type BoneCollider = {
  offset: number;
  lateral: number;
  radius: number;
  weight: number;
};

type BoneColliderState = {
  x: number;
  y: number;
  radius: number;
  weight: number;
  localX: number;
  localY: number;
};


type BoneTexture = {
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  visibleLongest: number;
  mask?: BoneMask;
  mirrorX: boolean;
  mirrorY: boolean;
  angleOffset: number;
};
type BoneSprite = {
  texture: BoneTexture;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  radius: number;
  maxRadius: number;
  colliders: BoneCollider[];
  axisX: number;
  axisY: number;
  perpX: number;
  perpY: number;
  centreOffsetX: number;
  centreOffsetY: number;
  baseAngle: number;
  angle: number;
  angularVelocity: number;
  spin: number;
  phase: number;
  swaySpeed: number;
  tiltSpeed: number;
  frequency: number;
  anchorX: number;
  anchorY: number;
  restX: number;
  restY: number;
  release: number;
  idleTime: number;
  mass: number;
  inertia: number;
  layer: number;
};

function getSpriteColliders(sprite: BoneSprite): BoneCollider[] {
  if (sprite.colliders.length) return sprite.colliders;
  const fallbackRadius = Math.max(6, sprite.radius || 12);
  const fallbackWeight = Math.max(
    1,
    sprite.mass || fallbackRadius * fallbackRadius * 0.5,
  );
  return [
    {
      offset: 0,
      lateral: 0,
      radius: fallbackRadius,
      weight: fallbackWeight,
    },
  ];
}

function computeColliderState(
  sprite: BoneSprite,
  collider: BoneCollider,
  cos?: number,
  sin?: number,
): BoneColliderState {
  const angleCos = cos ?? Math.cos(sprite.angle);
  const angleSin = sin ?? Math.sin(sprite.angle);
  const localX =
    sprite.centreOffsetX +
    sprite.axisX * collider.offset +
    sprite.perpX * collider.lateral;
  const localY =
    sprite.centreOffsetY +
    sprite.axisY * collider.offset +
    sprite.perpY * collider.lateral;
  return {
    x: sprite.x + localX * angleCos - localY * angleSin,
    y: sprite.y + localX * angleSin + localY * angleCos,
    radius: collider.radius,
    weight: collider.weight,
    localX,
    localY,
  };
}

function getPointVelocity(
  sprite: BoneSprite,
  state: BoneColliderState,
) {
  return {
    x: sprite.vx - sprite.angularVelocity * state.localY,
    y: sprite.vy + sprite.angularVelocity * state.localX,
  };
}

const BONE_ALPHA_THRESHOLD = 18;
const boneMeasureCanvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
function analyzeBoneTexture(image: HTMLImageElement): BoneTexture | null {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const fallback = (): BoneTexture => ({
    image,
    sourceX: 0,
    sourceY: 0,
    sourceWidth: width,
    sourceHeight: height,
    visibleLongest: Math.max(width, height),
    mask: undefined,
    mirrorX: false,
    mirrorY: false,
    angleOffset: 0,
  });
  if (!boneMeasureCanvas) {
    return fallback();
  }
  boneMeasureCanvas.width = width;
  boneMeasureCanvas.height = height;
  const ctx = boneMeasureCanvas.getContext("2d");
  if (!ctx) {
    return fallback();
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > BONE_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX === -1 || maxY === -1) {
    return fallback();
  }
  const rawWidth = Math.max(1, maxX - minX + 1);
  const rawHeight = Math.max(1, maxY - minY + 1);
  const padding = Math.min(
    Math.max(2, Math.round(Math.max(rawWidth, rawHeight) * 0.1)),
    Math.max(width, height),
  );
  const sourceX = Math.max(0, minX - padding);
  const sourceY = Math.max(0, minY - padding);
  const sourceWidth = Math.min(width - sourceX, rawWidth + padding * 2);
  const sourceHeight = Math.min(height - sourceY, rawHeight + padding * 2);
  const paddedLongest = Math.max(sourceWidth, sourceHeight);
  const mask = buildBoneMask({
    imageWidth: width,
    imageHeight: height,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    pixels: data,
  });
  return {
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    visibleLongest: paddedLongest,
    mask,
    mirrorX: false,
    mirrorY: false,
    angleOffset: 0,
  };
}

function buildBoneMask({
  imageWidth,
  imageHeight,
  sourceX,
  sourceY,
  sourceWidth,
  sourceHeight,
  pixels,
}: {
  imageWidth: number;
  imageHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  pixels: Uint8ClampedArray;
}): BoneMask | undefined {
  const xStart = Math.max(0, Math.floor(sourceX));
  const yStart = Math.max(0, Math.floor(sourceY));
  const xEnd = Math.min(imageWidth, Math.ceil(sourceX + sourceWidth));
  const yEnd = Math.min(imageHeight, Math.ceil(sourceY + sourceHeight));
  const points: { x: number; y: number }[] = [];
  for (let y = yStart; y < yEnd; y++) {
    const rowIndex = y * imageWidth;
    for (let x = xStart; x < xEnd; x++) {
      const alpha = pixels[(rowIndex + x) * 4 + 3];
      if (alpha > BONE_ALPHA_THRESHOLD) {
        points.push({ x, y });
      }
    }
  }
  if (points.length < 12) return undefined;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;
  let covXX = 0;
  let covXY = 0;
  let covYY = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    covXX += dx * dx;
    covXY += dx * dy;
    covYY += dy * dy;
  }
  covXX /= points.length;
  covXY /= points.length;
  covYY /= points.length;
  let axisX = 1;
  let axisY = 0;
  if (Number.isFinite(covXX) && Number.isFinite(covYY)) {
    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const discriminant = Math.max(0, Math.max(0, trace * trace * 0.25 - det));
    const lambda = trace * 0.5 + Math.sqrt(discriminant);
    if (Math.abs(covXY) > 1e-5 || Math.abs(lambda - covYY) > 1e-5) {
      axisX = lambda - covYY;
      axisY = covXY;
    } else if (covXX >= covYY) {
      axisX = 1;
      axisY = 0;
    } else {
      axisX = 0;
      axisY = 1;
    }
  }
  let axisLen = Math.hypot(axisX, axisY);
  if (!axisLen || !Number.isFinite(axisLen)) {
    if (sourceWidth >= sourceHeight) {
      axisX = 1;
      axisY = 0;
    } else {
      axisX = 0;
      axisY = 1;
    }
    axisLen = 1;
  }
  axisX /= axisLen;
  axisY /= axisLen;
  if (axisX < 0) {
    axisX *= -1;
    axisY *= -1;
  }
  const perpX = -axisY;
  const perpY = axisX;
  const projections: { t: number; n: number }[] = [];
  let minT = Infinity;
  let maxT = -Infinity;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    const t = dx * axisX + dy * axisY;
    const n = dx * perpX + dy * perpY;
    projections.push({ t, n });
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const length = Math.max(1, maxT - minT);
  const sampleCount = Math.max(12, Math.min(28, Math.round(Math.max(sourceWidth, sourceHeight) / 4)));
  const bins = Array.from({ length: sampleCount }, () => ({
    min: Infinity,
    max: -Infinity,
    weight: 0,
  }));
  const axisSpan = sampleCount > 1 ? sampleCount - 1 : 1;
  for (const proj of projections) {
    const pos = ((proj.t - minT) / length) * axisSpan;
    const lowerIndex = Math.max(0, Math.min(sampleCount - 1, Math.floor(pos)));
    const upperIndex = Math.max(0, Math.min(sampleCount - 1, Math.ceil(pos)));
    const frac = Math.min(1, Math.max(0, pos - lowerIndex));
    const lowerWeight = 1 - frac;
    const upperWeight = frac;
    const apply = (index: number, weight: number) => {
      if (weight <= 0) return;
      const bin = bins[index];
      if (proj.n < bin.min) bin.min = proj.n;
      if (proj.n > bin.max) bin.max = proj.n;
      bin.weight += weight;
    };
    apply(lowerIndex, lowerWeight);
    if (upperIndex != lowerIndex) {
      apply(upperIndex, upperWeight);
    }
  }
  for (let i = 0; i < sampleCount; i++) {
    const bin = bins[i];
    if (Number.isFinite(bin.min) && Number.isFinite(bin.max)) continue;
    let left = i - 1;
    while (left >= 0 && !Number.isFinite(bins[left].min)) left--;
    let right = i + 1;
    while (right < sampleCount && !Number.isFinite(bins[right].min)) right++;
    if (left >= 0 && right < sampleCount) {
      const t = (i - left) / (right - left);
      bin.min = bins[left].min + (bins[right].min - bins[left].min) * t;
      bin.max = bins[left].max + (bins[right].max - bins[left].max) * t;
      bin.weight = (bins[left].weight + bins[right].weight) * 0.5;
    } else if (left >= 0) {
      bin.min = bins[left].min;
      bin.max = bins[left].max;
      bin.weight = bins[left].weight;
    } else if (right < sampleCount) {
      bin.min = bins[right].min;
      bin.max = bins[right].max;
      bin.weight = bins[right].weight;
    } else {
      bin.min = -0.5;
      bin.max = 0.5;
      bin.weight = 1;
    }
  }
  const axisStep = length / Math.max(1, axisSpan);
  const centreOffsetX = meanX - (sourceX + sourceWidth / 2);
  const centreOffsetY = meanY - (sourceY + sourceHeight / 2);
  const outline: BoneMaskOutlinePoint[] = [];
  const topPoints: { x: number; y: number }[] = [];
  const bottomPoints: { x: number; y: number }[] = [];
  const segments: BoneMaskSegment[] = [];
  let area = 0;
  let maxRadius = 0;
  let widthTotal = 0;
  for (let i = 0; i < sampleCount; i++) {
    const bin = bins[i];
    const widthSpan = Math.max(0, bin.max - bin.min);
    const offsetRatio = axisSpan ? i / axisSpan : 0;
    const offset = minT + length * offsetRatio;
    const lateral = (bin.max + bin.min) * 0.5;
    const radius = Math.max(0.5, widthSpan * 0.5);
    const weight = Math.max(1e-3, widthSpan * axisStep);
    segments.push({ offset, lateral, radius, weight });
    const topX = axisX * offset + perpX * bin.max;
    const topY = axisY * offset + perpY * bin.max;
    const bottomX = axisX * offset + perpX * bin.min;
    const bottomY = axisY * offset + perpY * bin.min;
    topPoints.push({ x: topX, y: topY });
    bottomPoints.push({ x: bottomX, y: bottomY });
    outline.push({ x: topX + centreOffsetX, y: topY + centreOffsetY });
    maxRadius = Math.max(maxRadius, Math.hypot(topX + centreOffsetX, topY + centreOffsetY));
    widthTotal += widthSpan;
    if (i > 0) {
      const prevWidth = Math.max(0, bins[i - 1].max - bins[i - 1].min);
      area += ((prevWidth + widthSpan) * 0.5) * axisStep;
    }
  }
  for (let i = bottomPoints.length - 1; i >= 0; i--) {
    const pt = bottomPoints[i];
    outline.push({ x: pt.x + centreOffsetX, y: pt.y + centreOffsetY });
    maxRadius = Math.max(maxRadius, Math.hypot(pt.x + centreOffsetX, pt.y + centreOffsetY));
  }
  const effectiveLength = Math.max(length, 1);
  const avgWidth = widthTotal / Math.max(1, sampleCount);
  const massEstimate = Math.max(1, area || (avgWidth * effectiveLength));
  const inertia = (massEstimate * (effectiveLength * effectiveLength + avgWidth * avgWidth)) / 12;
  return {
    centreOffsetX,
    centreOffsetY,
    axisX,
    axisY,
    perpX,
    perpY,
    length: effectiveLength,
    segments,
    outline,
    area: massEstimate,
    inertia,
    maxRadius,
  };
}

const BOWL_ALPHA_THRESHOLD = 4;
const bowlMeasureCanvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
type BowlProfilePoint = {
  height: number;
  halfWidth: number;
  left: number;
  right: number;
  sourceY: number;
  canvasY: number;
};
type BowlAnalysis = {
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  profile: BowlProfilePoint[];
};
type BowlScanPoint = {
  y: number;
  left: number;
  right: number;
};
function analyzeBowlImage(image: HTMLImageElement): BowlAnalysis | null {
  const imgWidth = image.naturalWidth || image.width || 0;
  const imgHeight = image.naturalHeight || image.height || 0;
  if (!imgWidth || !imgHeight || !bowlMeasureCanvas) return null;
  bowlMeasureCanvas.width = imgWidth;
  bowlMeasureCanvas.height = imgHeight;
  const ctx = bowlMeasureCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, imgWidth, imgHeight);
  ctx.drawImage(image, 0, 0, imgWidth, imgHeight);
  const { data } = ctx.getImageData(0, 0, imgWidth, imgHeight);
  const rows: { y: number; left: number; right: number; width: number }[] = [];
  let top = imgHeight;
  let bottom = -1;
  let leftBound = imgWidth;
  let rightBound = -1;
  for (let y = 0; y < imgHeight; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < imgWidth; x++) {
      const alpha = data[(y * imgWidth + x) * 4 + 3];
      if (alpha > BOWL_ALPHA_THRESHOLD) {
        if (left === -1) left = x;
        right = x;
      }
    }
    if (left !== -1 && right !== -1) {
      const rowWidth = right - left + 1;
      rows.push({ y, left, right, width: rowWidth });
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (left < leftBound) leftBound = left;
      if (right > rightBound) rightBound = right;
    }
  }
  if (!rows.length || bottom <= top || rightBound <= leftBound) return null;
  const adjusted: { y: number; left: number; right: number; width: number }[] = [];
  let lastWidth = rows[0].width;
  let slopeSegments = 1;
  const widthThreshold = Math.max(1, rows[0].width * 0.008);
  const growthLimit = 0.012;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let width = row.width;
    if (width < lastWidth - widthThreshold) {
      slopeSegments += 1;
    } else if (slopeSegments >= 3 && width > lastWidth) {
      width = lastWidth;
    }
    const centre = (row.left + row.right) / 2;
    let half = width / 2;
    let left = centre - half;
    let right = centre + half;
    if (left < 0) {
      right -= left;
      left = 0;
    }
    if (right > imgWidth - 1) {
      left -= right - (imgWidth - 1);
      right = imgWidth - 1;
    }
    left = Math.max(0, left);
    right = Math.min(imgWidth - 1, right);
    width = Math.max(1, right - left);
    adjusted.push({ y: row.y, left, right, width });
    lastWidth = width;
  }
  const first = adjusted[0];
  const last = adjusted[adjusted.length - 1];
  top = first.y;
  bottom = last.y;
  leftBound = adjusted.reduce((min, row) => (row.left < min ? row.left : min), first.left);
  rightBound = adjusted.reduce((max, row) => (row.right > max ? row.right : max), first.right);
  const silhouetteWidth = rightBound - leftBound + 1;
  const silhouetteHeight = bottom - top + 1;
  const profile: BowlProfilePoint[] = adjusted.map((row, index) => ({
    height: silhouetteHeight ? (row.y - top) / silhouetteHeight : 0,
    halfWidth: row.width / 2,
    left: row.left,
    right: row.right,
    sourceY: row.y,
    canvasY: row.y,
  }));
  return {
    width: silhouetteWidth,
    height: silhouetteHeight,
    top,
    bottom,
    left: leftBound,
    right: rightBound,
    profile,
  };
}

function EarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 2.5-1 3.5-2 4.5-.9.9-2 2-2 3.5a3 3 0 0 1-6 0" />
      <path d="M6 19c0-1.5 1-2.5 2-3.5" />
    </svg>
  );
}
function EarOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 8a6 6 0 0 1 9.5-4.9" />
      <path d="M10 21a3 3 0 0 0 3-3c0-1.5 1.1-2.6 2-3.5" />
      <path d="M6 19c0-1.5 1-2.5 2-3.5" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
function buildInstructions(
  userPrompt: string,
  language: string,
  otherLang?: string,
  platform?: string,
  role?: string,
  hostName?: string,
  guestsCsv?: string,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const lang = language === "Other" ? otherLang || "English" : language;
  const platformLine =
    platform && platform !== "auto"
      ? `Platform: ${platform}`
      : `Platform: auto`;
  const roleLine =
    role && role !== "auto" ? `Agent role: ${role}` : `Agent role: auto`;
  const hostLine =
    hostName && hostName.trim() ? `Host: ${hostName.trim()}` : ``;
  const guestsLine =
    guestsCsv && guestsCsv.trim() ? `Guests: ${guestsCsv.trim()}` : ``;
  const base = [
    `Current date: ${dateStr}`,
    `Current time: ${timeStr}`,
    `Platform: ${platformLine}`,
    `Agent role: ${roleLine}`,
    `Host: ${hostLine}`,
    `Guests: ${guestsLine}`,
    "This agent may be used on platforms such as X (Twitter), Zoom, Google Meet, Clubhouse, Twitch, YouTube Live, Discord Stage, and more. Adapt instructions and etiquette to the selected platform.",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    "<IMPORTANT>ALWAYS CHECK THE MOST RECENT LANGUAGE ASSIGNED TO YOU BEFORE SPEAKING</IMPORTANT>",
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    `Default language: ${lang}`,
    "<IMPORTANT>Follow the default language for all responses. ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</IMPORTANT>",
    "Be concise and specific. Use short paragraphs and numbered/bulleted steps when helpful.",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<CRITICAL>ONLY SPEAK THE LANGUAGE YOU ARE ASSIGNED</CRITICAL>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
    "<MOST IMPORTANT>FOLLOW THE DEVELOPER'S INSTRUCTIONS</MOST IMPORTANT>",
  ].join("\n\n\n\n");
  const userPart = (userPrompt || "").trim();
  const toolsGuide = [
    "<TOOLS>",
    "Meeting scheduling requires a two-step tool sequence:",
    "1) First call check_availability with startISO, endISO, and timeZone to verify the window. You might have to wait for a second to recieve a response. DO NOT CALL THIS MULTIPLE TIMES BACK TO BACK.",
    "   - If any busy intervals overlap, propose an alternate time window and re-check.",
    "2) After confirming availability, communicate the availability to the callee, obtain their confirmation for a discrete timeslot, and then, and only then, use schedule_meeting and provide FULL event details:",
    "   leadId, title, description, location, startISO, endISO, timeZone, guests[], organizerEmail, conferenceType (e.g., google_meet), reminders[].",
    "Ensure additional guests are included in guests[].",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "NEVER EVER USE SCHEDULE_MEETING to check availability!",
    "</TOOLS>",
  ].join("\n");
  return userPart ? `${base}\n\n${toolsGuide}\n\n${userPart}` : `${base}\n\n${toolsGuide}`;
}
export default function ConsolePage() {
  const isMobile = useIsMobile();
  const [authedWallet, setAuthedWallet] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { authed: false }))
          .catch(() => ({ authed: false }));
        if (!cancelled && me?.authed && me?.wallet) {
          setAuthedWallet(String(me.wallet).toLowerCase());
          return;
        }
      } catch { }
      // Fallback to local storage override if present
      try {
        const w = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
        if (!cancelled && w) setAuthedWallet(w.toLowerCase());
      } catch { }
    })();
    return () => { cancelled = true; };
  }, []);
  // Shim account shape to avoid thirdweb/react dependency
  const account = useMemo(() => ({ address: authedWallet || "" }), [authedWallet]);
  const ownerAddr = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
  const isOwner =
    (account?.address || "").toLowerCase() === ownerAddr && !!ownerAddr;
  const [isListening, setIsListening] = useState(false);
  const [micCaptureActive, setMicCaptureActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSilenced, setIsSilenced] = useState(false);
  const [silenceSeconds, setSilenceSeconds] = useState(0);
  const silenceIntervalRef = useRef<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [usedToday, setUsedToday] = useState(0);
  const [voice, setVoice] = useState<VoiceName>("coral");
  const [rollOpen, setRollOpen] = useState(false);
  const [rollTheme, setRollTheme] = useState("");
  const [rollArchetype, setRollArchetype] = useState("auto");
  const [rollTone, setRollTone] = useState("auto");
  const [rollStyle, setRollStyle] = useState("auto");
  const [rollDomain, setRollDomain] = useState("auto");
  // Session domain (for presence/Live Now). Roll domain above is for prompt generation only
  const [sessionDomain, setSessionDomain] = useState<string>("auto");
  // Dirty/active tracking for section states
  const [dirty, setDirty] = useState<{
    language?: boolean;
    platform?: boolean;
    role?: boolean;
    domain?: boolean;
    link?: boolean;
    params?: boolean;
    prompt?: boolean;
  }>({});
  const [active, setActive] = useState<{
    language?: boolean;
    platform?: boolean;
    role?: boolean;
    domain?: boolean;
    link?: boolean;
    params?: boolean;
    prompt?: boolean;
  }>({});
  const [domainLocked, setDomainLocked] = useState<string>("");
  const [rollQuirk, setRollQuirk] = useState("balanced");
  const [rollFormatting, setRollFormatting] = useState("auto");
  const [rollLength, setRollLength] = useState("medium");
  const [rollTopics, setRollTopics] = useState<string[]>([]);
  const [vadThreshold, setVadThreshold] = useState(0.5);
  const [vadPrefixMs, setVadPrefixMs] = useState(200);
  const [vadSilenceMs, setVadSilenceMs] = useState(300);
  const [maxResponse, setMaxResponse] = useState(2000);
  const [temperature, setTemperature] = useState(0.7);
  const [language, setLanguage] = useState<string>("English");
  const [otherLanguage, setOtherLanguage] = useState<string>("");
  const [nonGeoOption, setNonGeoOption] = useState<string>("");
  const [platform, setPlatform] = useState<string>("auto");
  const [agentRole, setAgentRole] = useState<string>("auto");
  const [hostName, setHostName] = useState<string>("");
  const [guestNames, setGuestNames] = useState<string>("");
  const [guestList, setGuestList] = useState<string[]>([]);
  const [spaceUrl, setSpaceUrl] = useState<string>("");
  const [spacePublic, setSpacePublic] = useState<boolean>(false);
  const [spaceImage, setSpaceImage] = useState<string>("");
  const [spaceImageUrlInput, setSpaceImageUrlInput] = useState<string>("");
  const [spaceImageError, setSpaceImageError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>("ETH");
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({ ETH: 1 });
  const [ethPer2Min, setEthPer2Min] = useState<number>(0.001);
  const ChecklistComponent = useMemo(
    () => require("@/components/ui/interactive-checklist").default as any,
    [],
  );
  const languageLabel = useMemo(() => {
    if (language === "Other") {
      return (otherLanguage || "").trim();
    }
    return language;
  }, [language, otherLanguage]);
  const previewTags = useMemo(() => {
    const list: string[] = [];
    if (sessionDomain && sessionDomain !== "auto") list.push(sessionDomain);
    if (languageLabel) list.push(languageLabel);
    return list;
  }, [sessionDomain, languageLabel]);
  const ownerLabel =
    hostName?.trim() ||
    (account?.address
      ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
      : "Your session");
  const ownerSubLabel = spacePublic ? "Just now - Live" : "Preview - Not live";
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an efficient assistant. Keep responses concise.",
  );
  const latestPromptRef = useRef(systemPrompt);
  const [presets, setPresets] = useState<ConsolePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const presetsLoadedRef = useRef(false);
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) || null,
    [presets, selectedPresetId],
  );
  const sortedPresets = useMemo(() => {
    return [...presets].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [presets]);
  const systemPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const [promptSelection, setPromptSelection] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const [ipaMenuOpen, setIpaMenuOpen] = useState(false);
  const [ipaOptions, setIpaOptions] = useState<string[]>([]);
  const [ipaLoading, setIpaLoading] = useState(false);
  const [ipaError, setIpaError] = useState<string | null>(null);
  const ipaMenuRef = useRef<HTMLDivElement | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetDraftName, setPresetDraftName] = useState("");
  const [presetDialogError, setPresetDialogError] = useState<string | null>(
    null,
  );
  const presetDialogRef = useRef<HTMLDivElement | null>(null);
  const presetNameInputRef = useRef<HTMLInputElement | null>(null);
  const updatePromptSelection = () => {
    const el = systemPromptRef.current;
    if (!el) {
      setPromptSelection(null);
      return;
    }
    try {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start === end) {
        setPromptSelection(null);
        return;
      }
      const selected = el.value.slice(start, end);
      if (!selected.trim()) {
        setPromptSelection(null);
        return;
      }
      setPromptSelection({ start, end, text: selected });
    } catch {
      setPromptSelection(null);
    }
  };
  const handleOpenIpaMenu = async () => {
    const selection = promptSelection;
    if (!selection || !selection.text.trim()) return;
    const selectionText = selection.text;
    setIpaMenuOpen(true);
    setIpaLoading(true);
    setIpaError(null);
    setIpaOptions([]);
    try {
      const res = await fetch("/api/ipa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectionText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Unable to convert to IPA",
        );
      }
      if (!promptSelection || promptSelection.text !== selectionText) return;
      const rawOptions = Array.isArray(data?.options) ? data.options : [];
      const fallback = typeof data?.ipa === "string" ? data.ipa : "";
      const unique = Array.from(
        new Set(
          [...rawOptions, fallback]
            .map((opt: any) => (typeof opt === "string" ? opt.trim() : ""))
            .filter((opt) => opt.length > 0),
        ),
      );
      setIpaOptions(unique.slice(0, 5));
      setIpaError(
        unique.length === 0
          ? "No IPA suggestions available for this selection."
          : null,
      );
    } catch (error: any) {
      if (!promptSelection || promptSelection.text !== selectionText) return;
      setIpaError(error?.message || "Unable to convert to IPA");
      setIpaOptions([]);
    } finally {
      setIpaLoading(false);
    }
  };
  const applyIpaOption = (value: string) => {
    const replacement = (value || "").trim();
    if (!replacement) return;
    let activeSelection = promptSelection;
    if (!activeSelection) {
      const el = systemPromptRef.current;
      if (el) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        if (start !== end) {
          activeSelection = { start, end, text: el.value.slice(start, end) };
        }
      }
    }
    if (!activeSelection) return;
    const { start, end } = activeSelection;
    setSystemPrompt(
      (prev) => prev.slice(0, start) + replacement + prev.slice(end),
    );
    try {
      setDirty((d) => ({ ...(d || {}), prompt: true }));
    } catch { }
    setPromptSelection({
      start,
      end: start + replacement.length,
      text: replacement,
    });
    setIpaMenuOpen(false);
    setIpaOptions([]);
    setIpaError(null);
    setIpaLoading(false);
    requestAnimationFrame(() => {
      const el = systemPromptRef.current;
      if (el) {
        el.focus();
        el.selectionStart = start;
        el.selectionEnd = start + replacement.length;
      }
    });
  };
  const [speakingText, setSpeakingText] = useState("");
  const speakingRef = useRef("");
  useEffect(() => {
    speakingRef.current = speakingText;
  }, [speakingText]);
  // Load any saved system prompt (so Apply Settings before start is honored)
  useEffect(() => {
    try {
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem("cb:systemPrompt")
          : null;
      if (saved && saved.trim()) setSystemPrompt(saved);
    } catch { }
    async function onMsg(e: MessageEvent) {
      try {
        if (e?.data?.type === "billing:refresh") {
          try {
            await fetch("/api/billing/balance", { headers: { "x-wallet": (account?.address || "").toLowerCase() } })
              .then((r) => r.json())
              .then((j) =>
                setBalance({
                  balanceSeconds: Number(j.balanceSeconds || 0),
                  degraded: !!j.degraded,
                }),
              );
          } catch { }
        }
      } catch { }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  // Simple session id per page-load
  const [sessionId] = useState(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const handleSpaceUrlChange = useCallback(
    (value: string) => {
      setSpaceUrl(value);
      const trimmed = value.trim();
      try {
        setDirty((d) => ({ ...(d || {}), link: true }));
      } catch { }
      try {
        const wallet = (account?.address || "").toLowerCase();
        if (wallet && isListening) {
          fetch("/api/users/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": wallet },
            body: JSON.stringify({
              live: true,
              sessionId,
              spaceUrl: trimmed || undefined,
              spacePublic,
              spaceImage: spaceImage || undefined,
            }),
          }).catch(() => { });
        }
      } catch { }
    },
    [account?.address, isListening, sessionId, spaceImage, spacePublic],
  );
  const handleSpacePublicToggle = useCallback(
    (nextValue: boolean) => {
      setSpacePublic(nextValue);
      try {
        setDirty((d) => ({ ...(d || {}), link: true }));
      } catch { }
      try {
        const wallet = (account?.address || "").toLowerCase();
        if (wallet && isListening) {
          fetch("/api/users/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": wallet },
            body: JSON.stringify({
              live: true,
              sessionId,
              spaceUrl: (spaceUrl || "").trim() || undefined,
              spacePublic: nextValue,
              spaceImage: spaceImage || undefined,
            }),
          }).catch(() => { });
        }
      } catch { }
    },
    [account?.address, isListening, sessionId, spaceImage, spaceUrl],
  );
  const handleSpaceImageUrlChange = useCallback(
    (value: string) => {
      setSpaceImageUrlInput(value);
      const trimmed = value.trim();
      const isValidRemote = /^https?:\/\//i.test(trimmed);
      const isDataUri = trimmed.startsWith("data:image");
      if (trimmed && !isValidRemote && !isDataUri) {
        setSpaceImageError("Use an http(s) image URL or upload a file.");
      } else {
        setSpaceImageError(null);
      }
      setSpaceImage(trimmed);
      try {
        setDirty((d) => ({ ...(d || {}), link: true }));
      } catch { }
      try {
        const wallet = (account?.address || "").toLowerCase();
        if (wallet && isListening) {
          fetch("/api/users/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": wallet },
            body: JSON.stringify({
              live: true,
              sessionId,
              spaceUrl: (spaceUrl || "").trim() || undefined,
              spacePublic,
              spaceImage: trimmed || undefined,
            }),
          }).catch(() => { });
        }
      } catch { }
    },
    [account?.address, isListening, sessionId, spacePublic, spaceUrl],
  );
  const handleSpaceImageFileSelect = useCallback(
    (file: File | null) => {
      if (!file) {
        setSpaceImage("");
        setSpaceImageUrlInput("");
        setSpaceImageError(null);
        try {
          setDirty((d) => ({ ...(d || {}), link: true }));
        } catch { }
        try {
          const wallet = (account?.address || "").toLowerCase();
          if (wallet && isListening) {
            fetch("/api/users/presence", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-wallet": wallet,
              },
              body: JSON.stringify({
                live: true,
                sessionId,
                spaceUrl: (spaceUrl || "").trim() || undefined,
                spacePublic,
                spaceImage: undefined,
              }),
            }).catch(() => { });
          }
        } catch { }
        return;
      }
      if (!file.type.startsWith("image/")) {
        setSpaceImageError("Please choose an image file.");
        return;
      }
      setSpaceImageError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        setSpaceImage(result);
        setSpaceImageUrlInput("");
        try {
          setDirty((d) => ({ ...(d || {}), link: true }));
        } catch { }
        try {
          const wallet = (account?.address || "").toLowerCase();
          if (wallet && isListening) {
            fetch("/api/users/presence", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-wallet": wallet,
              },
              body: JSON.stringify({
                live: true,
                sessionId,
                spaceUrl: (spaceUrl || "").trim() || undefined,
                spacePublic,
                spaceImage: result || undefined,
              }),
            }).catch(() => { });
          }
        } catch { }
      };
      reader.onerror = () => {
        setSpaceImageError("Could not read image file. Try a different image.");
      };
      reader.readAsDataURL(file);
    },
    [account?.address, isListening, sessionId, spacePublic, spaceUrl],
  );
  const handleClearSpaceImage = useCallback(() => {
    setSpaceImage("");
    setSpaceImageUrlInput("");
    setSpaceImageError(null);
    try {
      setDirty((d) => ({ ...(d || {}), link: true }));
    } catch { }
    try {
      const wallet = (account?.address || "").toLowerCase();
      if (wallet && isListening) {
        fetch("/api/users/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": wallet },
          body: JSON.stringify({
            live: true,
            sessionId,
            spaceUrl: (spaceUrl || "").trim() || undefined,
            spacePublic,
            spaceImage: undefined,
          }),
        }).catch(() => { });
      }
    } catch { }
  }, [account?.address, isListening, sessionId, spacePublic, spaceUrl]);
  const [micVolume, setMicVolume] = useState(0);
  const [agentVolume, setAgentVolume] = useState(0);
  const [metersResetId, setMetersResetId] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [toolStatus, setToolStatus] = useState("");
  const [toolCalls, setToolCalls] = useState<{ name: string; args: any; t: number }[]>([]);
  const lastToolRef = useRef<{ name: string; argsHash: string; t: number } | null>(null);

  // Infer a tool name when the runtime does not send one on the header
  function inferToolName(name: any, args: any): string {
    try {
      const raw = typeof name === "string" ? name.trim() : "";
      const normalized = raw
        .toLowerCase()
        .replace(/[.\s-]+/g, "_"); // normalize separators

      // Known tool synonyms map
      const map: Record<string, string> = {
        // silence tools
        silence: "start_silence",
        start_silence: "start_silence",
        start_pause: "start_silence",
        mute: "start_silence",
        stop_silence: "stop_silence",

        // host mode tools
        host_start: "host_start",
        host_resume: "host_resume",
        host_invite: "host_invite",
        host_closing: "host_closing",
        host_stop: "host_stop",

        // media player tools
        media_play: "media_play",
        media_playback_start: "media_play",
        play_media: "media_play",
        play: "media_play",
        play_music: "media_play",
        music_play: "media_play",
        resume_music: "media_play",
        media_stop: "media_stop",
        media_pause: "media_stop",
        stop_media: "media_stop",
        pause: "media_stop",
        pause_music: "media_stop",
        stop_music: "media_stop",

        // trivia tools
        trivia_start: "trivia_start",
        trivia_begin: "trivia_start",
        trivia_answer: "trivia_answer",

        // CRM tools
        check_availability: "check_availability",
        availability_check: "check_availability",
        calendar_availability: "check_availability",
        calendar_freebusy: "check_availability",
        freebusy: "check_availability",
        availability: "check_availability",

        schedule_meeting: "schedule_meeting",
        schedule: "schedule_meeting",
        book_meeting: "schedule_meeting",
      };

      // If raw name is present and not "unknown", use normalized mapping
      if (raw && normalized !== "unknown") {
        return map[normalized] || normalized;
      }

      // Argument-based inference only if header name is empty/unknown
      if (args && typeof args === "object") {
        const hasSeconds =
          Object.prototype.hasOwnProperty.call(args, "seconds") ||
          Object.prototype.hasOwnProperty.call(args, "duration");
        const hasPlayers = Array.isArray((args as any).players);
        const hasPlayer = typeof (args as any).player === "string";
        const hasCorrect = typeof (args as any).correct === "boolean";

        const hasStartEnd =
          typeof (args as any).startISO === "string" &&
          typeof (args as any).endISO === "string";

        // Fields that indicate a scheduling intent (beyond just checking a window)
        const hasLeadId =
          typeof (args as any).leadId === "string" && !!(args as any).leadId.length;
        const hasTitle =
          typeof (args as any).title === "string" && !!(args as any).title.length;
        const hasGuests =
          Array.isArray((args as any).guests) && (args as any).guests.length > 0;
        const hasConferenceType = typeof (args as any).conferenceType === "string";
        const hasOrganizerEmail = typeof (args as any).organizerEmail === "string";
        const hasReminders = Array.isArray((args as any).reminders);
        const hasLocation = typeof (args as any).location === "string";
        const hasDescription = typeof (args as any).description === "string";

        if (hasSeconds) return "start_silence";
        if (hasPlayers) return "trivia_start";
        if (hasPlayer && hasCorrect) return "trivia_answer";

        if (hasStartEnd) {
          const looksLikeSchedule =
            hasLeadId ||
            hasTitle ||
            hasGuests ||
            hasConferenceType ||
            hasOrganizerEmail ||
            hasReminders ||
            hasLocation ||
            hasDescription;
          return looksLikeSchedule ? "schedule_meeting" : "check_availability";
        }
      }

      return raw || "unknown";
    } catch {
      return "unknown";
    }
  }

  // Tool call busy indicator and elapsed timer
  const [toolBusy, setToolBusy] = useState(false);
  const [currentTool, setCurrentTool] = useState<{ name: string; started: number } | null>(null);
  const toolBusyCountRef = useRef(0);
  const [, setToolTick] = useState(0);
  useEffect(() => {
    if (!toolBusy) return;
    const id = window.setInterval(() => setToolTick((t) => t + 1), 1000) as unknown as number;
    return () => {
      try { clearInterval(id); } catch { }
    };
  }, [toolBusy]);

  // Single-line status fade control for Recent Tool Calls stream
  const [statusTextKey, setStatusTextKey] = useState<string>("");
  const [statusPhase, setStatusPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    const last = toolCalls[0];
    const lastArgsKey =
      (() => { try { return JSON.stringify(last?.args || {}).slice(0, 120); } catch { return ""; } })();
    const runKey = currentTool ? `run:${currentTool.name}` : "";
    const lastKey = last?.name ? `last:${last.name}:${lastArgsKey}` : "";
    const idleKey = toolStatus ? `status:${toolStatus}` : "status:";
    const nextKey = toolBusy && currentTool ? runKey : (lastKey || idleKey);
    if (nextKey !== statusTextKey) {
      setStatusPhase("out");
      const t = window.setTimeout(() => {
        setStatusTextKey(nextKey);
        setStatusPhase("in");
      }, 120) as unknown as number;
      return () => { try { clearTimeout(t); } catch { } };
    }
    return;
  }, [toolBusy, currentTool?.name, toolCalls, toolStatus]);

  // Realtime/Debug instrumentation
  const [dcState, setDcState] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const [debugEvents, setDebugEvents] = useState<{ t: number; type: string; name?: string; info?: string }[]>([]);

  function sessionEth(seconds: number): number {
    return +(seconds * (ethPer2Min / 120)).toFixed(9);
  }
  const [balance, setBalance] = useState<{
    balanceSeconds: number;
    degraded?: boolean;
  } | null>(null);
  // Billing timer
  const billingIntervalRef = useRef<number | null>(null);
  const unloadHandlerRef = useRef<() => void>(() => { });
  const presenceIntervalRef = useRef<number | null>(null);
  const promptRefreshIntervalRef = useRef<number | null>(null);
  const [useMicInput, setUseMicInput] = useState(true);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaAudioRef = useRef<HTMLAudioElement | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);
  const micCaptureActiveRef = useRef(micCaptureActive);
  useEffect(() => {
    setMetersResetId((id) => id + 1);
  }, [micCaptureActive]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserMicRef = useRef<AnalyserNode | null>(null);
  const analyserAgentRef = useRef<AnalyserNode | null>(null);
  const analyserMediaRef = useRef<AnalyserNode | null>(null);
  const rafMicRef = useRef<number | null>(null);
  const rafAgentRef = useRef<number | null>(null);
  const rafMediaRef = useRef<number | null>(null);
  const fnCallAccRef = useRef<{ name: string; arguments: string } | null>(null);
  const triviaRef = useRef<{ players: string[]; scores: Record<string, number>; round: number; index: number; started: boolean }>({ players: [], scores: {}, round: 0, index: 0, started: false });
  // Sequenced instruction sender to ensure updates always take effect
  const instrSeqRef = useRef(0);
  const sendInstructions = useCallback(
    (reason?: string) => {
      try {
        const ch = dataChannelRef.current;
        if (ch && ch.readyState === "open") {
          instrSeqRef.current += 1;
          const versionTag = `<!-- instr:${instrSeqRef.current} -->`;
          const instructions = `${buildInstructions(latestPromptRef.current, language, otherLanguage, platform, agentRole, hostName, (guestList || []).join(", "))}
${versionTag}`;
          ch.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions,
                tool_choice: "auto",
                tools: [
                  {
                    type: "function",
                    name: "start_silence",
                    description:
                      "Silence the agent for a specified number of seconds; the agent should not process inputs or produce outputs during the silent period.",
                    parameters: {
                      type: "object",
                      properties: {
                        seconds: {
                          type: "number",
                          description: "Seconds to remain silent",
                        },
                        duration: {
                          type: "number",
                          description: "Alias for seconds",
                        },
                      },
                      required: [],
                    },
                  },
                  {
                    type: "function",
                    name: "stop_silence",
                    description:
                      "End the silent period and resume conversation.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "host_start",
                    description:
                      "Start Host mode: begin music, speak Invite lines periodically, and read Host Content after 5 minutes.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "host_stop",
                    description: "Stop Host mode and any playing music.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "host_invite",
                    description:
                      "Speak the Invite line immediately over the music.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "host_resume",
                    description:
                      "Resume Host mode and continue music/invites.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "host_closing",
                    description:
                      "Speak the Space Closer line and end Host mode.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "media_play",
                    description:
                      "Play the current track in the Media Player (if any).",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "media_stop",
                    description:
                      "Stop/pause any playing media from the Media Player.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                  {
                    type: "function",
                    name: "trivia_start",
                    description:
                      "Start a trivia game for 5 rounds with the given players.",
                    parameters: {
                      type: "object",
                      properties: {
                        players: {
                          type: "array",
                          items: { type: "string" },
                          description: "Player names",
                        },
                      },
                      required: ["players"],
                    },
                  },
                  {
                    type: "function",
                    name: "trivia_answer",
                    description:
                      "Record a player’s answer result for the current trivia question.",
                    parameters: {
                      type: "object",
                      properties: {
                        player: { type: "string", description: "Player name" },
                        correct: {
                          type: "boolean",
                          description: "Whether the answer was correct",
                        },
                      },
                      required: ["player", "correct"],
                    },
                  },
                  {
                    type: "function",
                    name: "check_availability",
                    description:
                      "Check calendar availability (busy and free intervals) for the proposed meeting window before scheduling. Always use this function first and communicate relative availability to the timeslot requested by the callee.",
                    parameters: {
                      type: "object",
                      properties: {
                        leadId: { type: "string", description: "CRM lead ID", nullable: true },
                        startISO: { type: "string", description: "Proposed start time ISO-8601" },
                        endISO: { type: "string", description: "Proposed end time ISO-8601" },
                        timeZone: { type: "string", description: "IANA timezone", nullable: true },
                        attendees: { type: "array", items: { type: "string" }, description: "Additional attendee emails", nullable: true },
                        calendarIds: { type: "array", items: { type: "string" }, description: "Calendars to query (IDs)", nullable: true }
                      },
                      required: ["startISO", "endISO"]
                    }
                  },
                  {
                    type: "function",
                    name: "schedule_meeting",
                    description:
                      "Schedule a meeting for a CRM lead (after availability check) and include full calendar event details. The meeting will be created on the CRM user's calendar and the lead will be invited as an attendee. DO NOT USE THIS FUNCTION TO CHECK AVAILABILITY EVER!!! DO NOT USE THIS FUNCTION TO CHECK AVAILABILITY EVER!!! DO NOT USE THIS FUNCTION TO CHECK AVAILABILITY EVER!!! DO NOT USE THIS FUNCTION TO CHECK AVAILABILITY EVER!!! DO NOT USE THIS FUNCTION TO CHECK AVAILABILITY EVER!!!",
                    parameters: {
                      type: "object",
                      properties: {
                        leadId: { type: "string", description: "Lead's email address or CRM lead ID" },
                        title: { type: "string", description: "Event title/summary" },
                        description: { type: "string", description: "Event description", nullable: true },
                        location: { type: "string", description: "Event location (plain text or address)", nullable: true },
                        startISO: { type: "string", description: "Start time ISO-8601" },
                        endISO: { type: "string", description: "End time ISO-8601" },
                        timeZone: { type: "string", description: "IANA timezone", nullable: true },
                        guests: { type: "array", items: { type: "string" }, description: "Guest emails to invite", nullable: true },
                        conferenceType: { type: "string", description: "Conference type (e.g., google_meet)", nullable: true },
                        reminders: { type: "array", items: { type: "number" }, description: "Reminder minutes before event", nullable: true }
                      },
                      required: ["leadId", "title", "startISO", "endISO"]
                    }
                  },
                ],
              },
            }),
          );
          try {
            if (reason !== "Prompt (sync)") {
              setToolStatus(`${reason || "Instructions"} applied`);
            }
          } catch { }
          // Send a follow-up a moment later to ensure the runtime applies it even under debouncing
          setTimeout(() => {
            try {
              if (
                !dataChannelRef.current ||
                dataChannelRef.current.readyState !== "open"
              )
                return;
              instrSeqRef.current += 1;
              const v2 = `<!-- instr:${instrSeqRef.current} -->`;
              const again = `${buildInstructions(latestPromptRef.current, language, otherLanguage, platform, agentRole, hostName, (guestList || []).join(", "))}
${v2}`;
              dataChannelRef.current.send(
                JSON.stringify({
                  type: "session.update",
                  session: {
                    instructions: again,
                    tool_choice: "auto",
                    tools: [
                      {
                        type: "function",
                        name: "start_silence",
                        description:
                          "Silence the agent for a specified number of seconds; the agent should not process inputs or produce outputs during the silent period.",
                        parameters: {
                          type: "object",
                          properties: {
                            seconds: {
                              type: "number",
                              description: "Seconds to remain silent",
                            },
                            duration: {
                              type: "number",
                              description: "Alias for seconds",
                            },
                          },
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "stop_silence",
                        description:
                          "End the silent period and resume conversation.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "host_start",
                        description:
                          "Start Host mode: begin music, speak Invite lines periodically, and read Host Content after 5 minutes.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "host_stop",
                        description: "Stop Host mode and any playing music.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "host_invite",
                        description:
                          "Speak the Invite line immediately over the music.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "host_resume",
                        description:
                          "Resume Host mode and continue music/invites.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "host_closing",
                        description:
                          "Speak the Space Closer line and end Host mode.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "media_play",
                        description:
                          "Play the current track in the Media Player (if any).",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "media_stop",
                        description:
                          "Stop/pause any playing media from the Media Player.",
                        parameters: {
                          type: "object",
                          properties: {},
                          required: [],
                        },
                      },
                      {
                        type: "function",
                        name: "trivia_start",
                        description:
                          "Start a trivia game for 5 rounds with the given players.",
                        parameters: {
                          type: "object",
                          properties: {
                            players: {
                              type: "array",
                              items: { type: "string" },
                              description: "Player names",
                            },
                          },
                          required: ["players"],
                        },
                      },
                      {
                        type: "function",
                        name: "trivia_answer",
                        description:
                          "Record a player’s answer result for the current trivia question.",
                        parameters: {
                          type: "object",
                          properties: {
                            player: {
                              type: "string",
                              description: "Player name",
                            },
                            correct: {
                              type: "boolean",
                              description: "Whether the answer was correct",
                            },
                          },
                          required: ["player", "correct"],
                        },
                      },
                      {
                        type: "function",
                        name: "check_availability",
                        description:
                          "Check calendar availability (busy intervals) for the proposed meeting window before scheduling. You will recieve both free and busy intervals and make sure to ONLY USE THIS FUNCTION TO CHECK AVAILABILITY. ONLY USE THIS FUNCTION TO CHECK AVAILABILITY.ONLY USE THIS FUNCTION TO CHECK AVAILABILITY.ONLY USE THIS FUNCTION TO CHECK AVAILABILITY.ONLY USE THIS FUNCTION TO CHECK AVAILABILITY.",
                        parameters: {
                          type: "object",
                          properties: {
                            leadId: { type: "string", description: "CRM lead ID", nullable: true },
                            startISO: { type: "string", description: "Proposed start time ISO-8601" },
                            endISO: { type: "string", description: "Proposed end time ISO-8601" },
                            timeZone: { type: "string", description: "IANA timezone", nullable: true },
                            attendees: { type: "array", items: { type: "string" }, description: "Additional attendee emails", nullable: true },
                            calendarIds: { type: "array", items: { type: "string" }, description: "Calendars to query (IDs)", nullable: true }
                          },
                          required: ["startISO", "endISO"]
                        }
                      },
                      {
                        type: "function",
                        name: "schedule_meeting",
                        description:
                          "Schedule a meeting for a CRM lead (after availability check) and include full calendar event details. The meeting will be created on the CRM user's calendar and the lead will be invited as an attendee. DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY! DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!DO NOT USE THIS FUNCTION TO CHECK_AVAILABILITY!",
                        parameters: {
                          type: "object",
                          properties: {
                            leadId: { type: "string", description: "Lead's email address or CRM lead ID" },
                            title: { type: "string", description: "Event title/summary" },
                            description: { type: "string", description: "Event description", nullable: true },
                            location: { type: "string", description: "Event location (plain text or address)", nullable: true },
                            startISO: { type: "string", description: "Start time ISO-8601" },
                            endISO: { type: "string", description: "End time ISO-8601" },
                            timeZone: { type: "string", description: "IANA timezone", nullable: true },
                            guests: { type: "array", items: { type: "string" }, description: "Guest emails to invite", nullable: true },
                            conferenceType: { type: "string", description: "Conference type (e.g., google_meet)", nullable: true },
                            reminders: { type: "array", items: { type: "number" }, description: "Reminder minutes before event", nullable: true }
                          },
                          required: ["leadId", "title", "startISO", "endISO"]
                        }
                      },
                    ],
                  },
                }),
              );
            } catch { }
          }, 150);
        }
      } catch { }
    },
    [language, otherLanguage, platform, agentRole, hostName, guestList],
  );
  // Developer message: force language switch mid-conversation
  const sendDeveloperLanguageSwitch = useCallback(() => {
    try {
      const ch = dataChannelRef.current;
      if (!ch || ch.readyState !== "open") return;
      const lang = language === "Other" ? otherLanguage || "English" : language;
      const text = `Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested. Developer note: Switch language immediately to ${lang}. Stop speaking the last language and continue ONLY in ${lang}. Do not mix English unless explicitly requested.`;
      const devEvent = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text }],
        },
      } as any;
      ch.send(JSON.stringify(devEvent));
      // Also inject a user message to explicitly request the announcement of the new language
      const userEvent = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.Announce the new language you are now assigned to speak and then say some small phrase to start the conversation in the new language.",
            },
          ],
        },
      } as any;
      ch.send(JSON.stringify(userEvent));
      // Nudge the model to apply the change now
      try {
        ch.send(JSON.stringify({ type: "response.create" }));
      } catch { }
    } catch { }
  }, [language, otherLanguage]);

  // Generic developer message helper (to steer model behavior precisely)
  const sendDeveloper = useCallback((text: string): boolean => {
    try {
      const ch = dataChannelRef.current;
      if (!ch || ch.readyState !== "open") return false;
      const devEvent = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text }],
        },
      } as any;
      ch.send(JSON.stringify(devEvent));
      try { ch.send(JSON.stringify({ type: "response.create" })); } catch { }
      return true;
    } catch {
      return false;
    }
  }, []);
  // VB-CABLE device routing (no device pickers; we play to system default)
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const agentOutRef = useRef<HTMLAudioElement | null>(null);
  const captureCurrentSettings = (): ConsolePresetSettings => ({
    voice,
    language,
    otherLanguage,
    nonGeoOption,
    platform,
    agentRole,
    hostName,
    guestList: [...guestList],
    sessionDomain,
    rollDomain,
    rollTheme,
    rollArchetype,
    rollTone,
    rollStyle,
    rollQuirk,
    rollFormatting,
    rollLength,
    rollTopics: [...rollTopics],
    maxResponse,
    temperature,
    vadThreshold,
    vadPrefixMs,
    vadSilenceMs,
    spaceUrl,
    spacePublic,
    currency,
    systemPrompt,
    selectedInputId,
    domainLocked,
  });
  const applyPreset = useCallback(
    (
      settings: ConsolePresetSettings | null | undefined,
      meta?: { name?: string; silent?: boolean },
    ) => {
      if (!settings) return;
      const safeNumber = (value: unknown, fallback: number) => {
        return typeof value === "number" && !Number.isNaN(value)
          ? value
          : fallback;
      };
      setVoice(settings.voice || "coral");
      setLanguage(settings.language || "English");
      setOtherLanguage(settings.otherLanguage || "");
      setNonGeoOption(settings.nonGeoOption || "");
      setPlatform(settings.platform || "auto");
      setAgentRole(settings.agentRole || "auto");
      setHostName(settings.hostName || "");
      setGuestList(
        Array.isArray(settings.guestList) ? [...settings.guestList] : [],
      );
      setSessionDomain(settings.sessionDomain || "auto");
      setRollDomain(settings.rollDomain || "auto");
      setRollTheme(settings.rollTheme || "");
      setRollArchetype(settings.rollArchetype || "auto");
      setRollTone(settings.rollTone || "auto");
      setRollStyle(settings.rollStyle || "auto");
      setRollQuirk(settings.rollQuirk || "balanced");
      setRollFormatting(settings.rollFormatting || "auto");
      setRollLength(settings.rollLength || "medium");
      setRollTopics(
        Array.isArray(settings.rollTopics) ? [...settings.rollTopics] : [],
      );
      setMaxResponse(safeNumber(settings.maxResponse, 2000));
      setTemperature(safeNumber(settings.temperature, 0.7));
      setVadThreshold(safeNumber(settings.vadThreshold, 0.5));
      setVadPrefixMs(Math.round(safeNumber(settings.vadPrefixMs, 200)));
      setVadSilenceMs(Math.round(safeNumber(settings.vadSilenceMs, 300)));
      setSpaceUrl(settings.spaceUrl || "");
      setSpacePublic(Boolean(settings.spacePublic));
      setCurrency(settings.currency || "ETH");
      setSystemPrompt(settings.systemPrompt || "");
      setSelectedInputId(settings.selectedInputId || "");
      setDomainLocked(settings.domainLocked || "");
      setGuestNames("");
      setDirty({});
      setPromptSelection(null);
      setIpaMenuOpen(false);
      setIpaOptions([]);
      setIpaError(null);
      setIpaLoading(false);
      setActive((a) => ({
        ...(a || {}),
        language: true,
        platform: true,
        role: true,
        domain: true,
        link: Boolean(settings.spaceUrl || settings.spacePublic),
        params: true,
        prompt: true,
      }));
      if (!meta?.silent) {
        try {
          setToolStatus(
            meta?.name ? `Preset applied: ${meta.name}` : "Preset applied",
          );
        } catch { }
      }
    },
    [],
  );
  const handleSelectPreset = (preset: ConsolePreset) => {
    applyPreset(preset.settings, { name: preset.name });
    setSelectedPresetId(preset.id);
    setPresetMenuOpen(false);
  };
  const createPresetWithName = (rawName: string): boolean => {
    const trimmed = (rawName || "").trim();
    if (!trimmed) {
      setPresetDialogError("Enter a name for this preset.");
      return false;
    }
    const now = Date.now();
    const newPreset: ConsolePreset = {
      id: `preset-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      settings: captureCurrentSettings(),
    };
    setPresets((prev) => [...prev, newPreset]);
    setSelectedPresetId(newPreset.id);
    setPresetMenuOpen(false);
    setPresetDialogError(null);
    try {
      setToolStatus(`Preset saved: ${trimmed}`);
    } catch { }
    return true;
  };
  const handleAddPreset = () => {
    const baseName = selectedPreset ? `${selectedPreset.name} copy` : "";
    setPresetDraftName(baseName);
    setPresetDialogError(null);
    setPresetDialogOpen(true);
  };
  const handleConfirmAddPreset = () => {
    if (!createPresetWithName(presetDraftName)) return;
    setPresetDialogOpen(false);
    setPresetDraftName("");
  };
  const handleCancelPresetDialog = () => {
    setPresetDialogOpen(false);
    setPresetDialogError(null);
    setPresetDraftName("");
  };
  const handleSavePreset = () => {
    if (!selectedPresetId) return;
    const currentSettings = captureCurrentSettings();
    const now = Date.now();
    setPresets((prev) =>
      prev.map((p) =>
        p.id === selectedPresetId
          ? { ...p, updatedAt: now, settings: currentSettings }
          : p,
      ),
    );
    const targetName = selectedPreset?.name || "Preset";
    try {
      setToolStatus(`Preset updated: ${targetName}`);
    } catch { }
  };
  const handleDeletePreset = (id: string) => {
    const target = presets.find((p) => p.id === id);
    if (!target) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete preset "${target.name}"?`);
    if (!confirmed) return;
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedPresetId === id) {
      setSelectedPresetId("");
    }
    try {
      setToolStatus(`Preset deleted: ${target.name}`);
    } catch { }
  };
  useEffect(() => {
    if (!presetMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!presetMenuRef.current) return;
      if (!presetMenuRef.current.contains(event.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", onClick);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", onClick);
      }
    };
  }, [presetMenuOpen]);
  useEffect(() => {
    if (!presetDialogOpen) return;
    setPresetDialogError(null);
    const timer =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
          try {
            presetNameInputRef.current?.focus();
            presetNameInputRef.current?.select();
          } catch { }
        }, 20)
        : undefined;
    return () => {
      if (typeof window !== "undefined" && typeof timer === "number") {
        window.clearTimeout(timer);
      }
    };
  }, [presetDialogOpen]);
  useEffect(() => {
    if (!presetDialogOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!presetDialogRef.current) return;
      if (!presetDialogRef.current.contains(event.target as Node)) {
        setPresetDialogOpen(false);
        setPresetDialogError(null);
        setPresetDraftName("");
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", onClick);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", onClick);
      }
    };
  }, [presetDialogOpen]);
  useEffect(() => {
    if (!presetDialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPresetDialogOpen(false);
        setPresetDialogError(null);
        setPresetDraftName("");
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", onKey);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("keydown", onKey);
      }
    };
  }, [presetDialogOpen]);
  useEffect(() => {
    if (!ipaMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!ipaMenuRef.current) return;
      if (!ipaMenuRef.current.contains(event.target as Node)) {
        setIpaMenuOpen(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", onClick);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", onClick);
      }
    };
  }, [ipaMenuOpen]);
  useEffect(() => {
    setIpaMenuOpen(false);
    setIpaOptions([]);
    setIpaError(null);
    if (!promptSelection || !promptSelection.text.trim()) {
      setIpaLoading(false);
    }
  }, [promptSelection]);
  useEffect(() => {
    // Load presets from server; fall back to localStorage
    (async () => {
      try {
        const wallet = (account?.address || "").toLowerCase();
        let loaded: ConsolePreset[] = [];
        let activeId = "";
        if (wallet) {
          try {
            const r = await fetch("/api/presets", { headers: { "x-wallet": wallet }, cache: "no-store" });
            if (r.ok) {
              const j = await r.json().catch(() => ({}));
              const serverPresets: any[] = Array.isArray(j?.presets) ? j.presets : [];
              activeId = typeof j?.activeId === "string" ? j.activeId : "";
              loaded = serverPresets
                .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string" && p.settings)
                .map((p: any) => ({
                  id: String(p.id),
                  name: String(p.name),
                  createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
                  updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
                  settings: {
                    ...(p.settings || {}),
                    guestList: Array.isArray(p.settings?.guestList) ? p.settings.guestList : [],
                    rollTopics: Array.isArray(p.settings?.rollTopics) ? p.settings.rollTopics : [],
                  },
                }));
            }
          } catch { }
        }
        if (!loaded.length) {
          try {
            const raw = typeof window !== "undefined" ? window.localStorage.getItem(PRESET_STORAGE_KEY) : null;
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                loaded = parsed
                  .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string" && p.settings)
                  .map((p: any) => ({
                    id: String(p.id),
                    name: String(p.name),
                    createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
                    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
                    settings: {
                      ...(p.settings || {}),
                      guestList: Array.isArray(p.settings?.guestList) ? p.settings.guestList : [],
                      rollTopics: Array.isArray(p.settings?.rollTopics) ? p.settings.rollTopics : [],
                    },
                  }));
              }
            }
            try { activeId = window.localStorage.getItem(PRESET_ACTIVE_KEY) || ""; } catch { }
          } catch { }
        }
        setPresets(loaded);
        if (activeId) {
          const found = loaded.find((p) => p.id === activeId);
          if (found) {
            setSelectedPresetId(found.id);
            applyPreset(found.settings, { name: found.name, silent: true });
          } else {
            setSelectedPresetId("");
          }
        }
        presetsLoadedRef.current = true;
      } catch { }
    })();
  }, [applyPreset, account?.address]);
  useEffect(() => {
    if (!presetsLoadedRef.current) return;
    // Persist to localStorage for offline; mirror to server when wallet connected
    try { if (typeof window !== "undefined") window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); } catch { }
    const wallet = (account?.address || "").toLowerCase();
    if (wallet) {
      try { fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json", "x-wallet": wallet }, body: JSON.stringify({ presets, activeId: selectedPresetId || undefined }) }); } catch { }
    }
  }, [presets]);
  useEffect(() => {
    if (!presetsLoadedRef.current) return;
    try {
      if (typeof window !== "undefined") {
        if (selectedPresetId) window.localStorage.setItem(PRESET_ACTIVE_KEY, selectedPresetId); else window.localStorage.removeItem(PRESET_ACTIVE_KEY);
      }
    } catch { }
    const wallet = (account?.address || "").toLowerCase();
    if (wallet) {
      try { fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json", "x-wallet": wallet }, body: JSON.stringify({ presets, activeId: selectedPresetId || undefined }) }); } catch { }
    }
  }, [selectedPresetId]);
  // Auto-enable microphone without a checkbox (default device)
  const ensureMicRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    micCaptureActiveRef.current = micCaptureActive;
  }, [micCaptureActive]);
  // No output selection; rely on system default device
  const startMeter = useCallback(
    (stream: MediaStream, which: "mic" | "agent") => {
      try {
        const ctx =
          audioCtxRef.current ||
          new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") {
          try {
            ctx.resume().catch(() => { });
          } catch { }
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        if (which === "mic" && rafMicRef.current) {
          cancelAnimationFrame(rafMicRef.current);
        }
        if (which === "agent" && rafAgentRef.current) {
          cancelAnimationFrame(rafAgentRef.current);
        }
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const value = Math.min(1, rms * 2);
          if (which === "mic") setMicVolume(value);
          else setAgentVolume(value);
          if (which === "mic") rafMicRef.current = requestAnimationFrame(tick);
          else rafAgentRef.current = requestAnimationFrame(tick);
        };
        tick();
        if (which === "mic") analyserMicRef.current = analyser;
        else analyserAgentRef.current = analyser;
      } catch { }
    },
    [],
  );
  // Initialize ensureMic after startMeter is defined
  useEffect(() => {
    ensureMicRef.current = async () => {
      if (!useMicInput) {
        return;
      }
      try {
        const micConstraints: any = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        };
        if (selectedInputId)
          micConstraints.deviceId = { exact: selectedInputId };
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints,
        });
        const shouldCapture = micCaptureActiveRef.current;
        try {
          if (inputStreamRef.current) {
            inputStreamRef.current.getTracks().forEach((t) => t.stop());
          }
        } catch { }
        if (shouldCapture) {
          inputStreamRef.current = mic;
          startMeter(mic, "mic");
          try { await ensureMicSender(peerConnectionRef.current); } catch { }
        } else {
          try {
            mic.getTracks().forEach((t) => t.stop());
          } catch { }
          inputStreamRef.current = null;
        }
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          const ins = list.filter((d) => d.kind === "audioinput");
          setInputs(ins);
          if (!selectedInputId) {
            const def = ins.find((d) => /^default/i.test(d.label || ""));
            if (def && def.deviceId) setSelectedInputId(def.deviceId);
          }
        } catch { }
      } catch (e: any) {
        setToolStatus(
          "Microphone permission is blocked. Grant access to enable voice input.",
        );
      }
    };
  }, [selectedInputId, startMeter, useMicInput]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureMicRef.current();
        if (!micCaptureActiveRef.current) setMicVolume(0);
      } catch { }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
      if (!micCaptureActiveRef.current) {
        try {
          const ms = inputStreamRef.current;
          if (ms) ms.getTracks().forEach((t) => t.stop());
        } catch { }
        inputStreamRef.current = null;
      }
    };
  }, [micCaptureActive, useMicInput, selectedInputId]);
  // Keep latest prompt in a ref and auto-apply when connected
  useEffect(() => {
    function onSetLanguage(ev: any) {
      try {
        const v = String(ev?.detail?.language || "");
        if (v) {
          setLanguage(v);
          const g = getGroupForLanguage(v);
          if (
            g === "OTHER/UNCLASSIFIED" ||
            g === "CONSTRUCTED & FICTIONAL LANGUAGES"
          )
            setNonGeoOption(v);
        }
      } catch { }
    }
    try {
      window.addEventListener("cb:setLanguage", onSetLanguage as any);
    } catch { }
    return () => {
      try {
        window.removeEventListener("cb:setLanguage", onSetLanguage as any);
      } catch { }
    };
  }, []);
  useEffect(() => {
    latestPromptRef.current = systemPrompt;
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem("cb:systemPrompt", systemPrompt || "");
    } catch { }
    sendInstructions("Prompt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemPrompt]);
  // Re-apply when language changes (mid-conversation language switching)
  useEffect(() => {
    sendInstructions("Language");
    sendDeveloperLanguageSwitch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, otherLanguage]);

  const sendUserMessage = useCallback((text: string): boolean => {
    try {
      const ch = dataChannelRef.current;
      if (!ch || ch.readyState !== "open") return false;
      const t = (text || "").trim();
      if (!t || isSilenced) return false;
      ch.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] }
      }));
      try { ch.send(JSON.stringify({ type: "response.create" })); } catch { }
      return true;
    } catch { return false; }
  }, [isSilenced]);
  // Re-apply non-language context without forcing a language switch
  useEffect(() => {
    sendInstructions("Context");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, agentRole, hostName, guestList]);
  // Poll balance occasionally for microtext display
  useEffect(() => {
    const wallet = (account?.address || "").toLowerCase();
    if (!wallet) return;
    let cancelled = false;
    const fetchBal = async () => {
      try {
        const w = (account?.address || "").toLowerCase();
        const r = await fetch(`/api/billing/balance`, {
          headers: { "x-wallet": w },
        });
        const j = await r.json();
        if (!cancelled)
          setBalance({
            balanceSeconds: Number(j.balanceSeconds || 0),
            degraded: !!j.degraded,
          });
      } catch { }
    };
    fetchBal();
    const i = window.setInterval(fetchBal, 30000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [account?.address]);
  // Load currency rates (units per 1 ETH)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/pricing/config");
        const j = await r.json().catch(() => ({}));
        const v = Number(j?.config?.ethPer2Min || 0.001);
        if (!cancelled && v > 0) setEthPer2Min(v);
      } catch { }
      try {
        const ethRates = await fetchEthRates();
        if (!cancelled) {
          const curated: Record<string, number> = { ETH: 1 };
          for (const c of CURRENCIES) {
            const code = c.code.toUpperCase();
            if ((ethRates as any)[code])
              curated[code] = (ethRates as any)[code];
          }
          setRates(curated);
        }
      } catch { }
    })();
    const i = window.setInterval(async () => {
      try {
        const ethRates = await fetchEthRates();
        const curated: Record<string, number> = { ETH: 1 };
        for (const c of CURRENCIES) {
          const code = c.code.toUpperCase();
          if ((ethRates as any)[code]) curated[code] = (ethRates as any)[code];
        }
        setRates(curated);
      } catch { }
    }, 60000) as unknown as number;
    return () => {
      cancelled = true;
      try {
        clearInterval(i);
      } catch { }
    };
  }, []);
  // Keep devices updated and reacquire when selection changes
  useEffect(() => {
    const onChange = () => {
      if (micCaptureActiveRef.current && useMicInput) {
        ensureMicRef.current();
      }
      try {
        navigator.mediaDevices
          .enumerateDevices()
          .then((list) =>
            setInputs(list.filter((d) => d.kind === "audioinput")),
          );
      } catch { }
    };
    try {
      navigator.mediaDevices.addEventListener("devicechange", onChange);
    } catch { }
    return () => {
      try {
        navigator.mediaDevices.removeEventListener("devicechange", onChange);
      } catch { }
    };
  }, [useMicInput]);
  const cleanupAnalyser = useCallback(() => {
    if (rafMicRef.current) cancelAnimationFrame(rafMicRef.current);
    if (rafAgentRef.current) cancelAnimationFrame(rafAgentRef.current);
    if (rafMediaRef.current) cancelAnimationFrame(rafMediaRef.current);
    rafMicRef.current = null;
    rafAgentRef.current = null;
    try {
      analyserMicRef.current?.disconnect();
    } catch { }
    try {
      analyserAgentRef.current?.disconnect();
    } catch { }
    try {
      analyserMediaRef.current?.disconnect();
    } catch { }
    try {
      audioCtxRef.current?.close();
    } catch { }
    audioCtxRef.current = null;
    analyserMicRef.current = null;
    analyserAgentRef.current = null;
    analyserMediaRef.current = null;
  }, []);
  const initWebRTC = useCallback(
    async (ephemeralKey: string) => {
      return new Promise<void>(async (resolve) => {
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;
        if (!audioRef.current) {
          const a = document.createElement("audio");
          a.autoplay = true;
          (a as any).playsInline = true;
          a.muted = false;
          a.volume = 1;
          document.body.appendChild(a);
          audioRef.current = a;
          agentOutRef.current = a;
        }
        pc.ontrack = (event) => {
          if (audioRef.current) {
            audioRef.current.srcObject = event.streams[0];
            audioRef.current.muted = false;
            try {
              audioRef.current.volume = 1;
              audioRef.current
                .play()
                .then(() => {
                  try { setAudioBlocked(false); } catch { }
                })
                .catch(() => {
                  try {
                    setAudioBlocked(true);
                    setToolStatus("Audio blocked; click Enable Audio");
                  } catch { }
                });
            } catch { }
            startMeter(event.streams[0], "agent");
          }
        };
        // mic to agent (auto-enabled)
        try {
          const micConstraints: any = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          };
          if (selectedInputId) micConstraints.deviceId = { exact: selectedInputId };

          // Ensure we always have a live audio track before adding to PC
          const ms = inputStreamRef.current;
          const needsNewStream =
            !ms ||
            ms.getAudioTracks().length === 0 ||
            ms.getAudioTracks().some((t) => t.readyState !== "live");

          let stream: MediaStream | null = inputStreamRef.current;
          if (needsNewStream || !stream) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
            inputStreamRef.current = stream;
          }

          let track = stream.getAudioTracks()[0];
          if (!track || track.readyState !== "live") {
            stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
            inputStreamRef.current = stream;
            track = stream.getAudioTracks()[0];
          }

          if (track && stream) {
            pc.addTrack(track, stream);
          }
          await ensureMicSender(pc);
        } catch { }
        setDcState("connecting");
        const dataChannel = pc.createDataChannel("realtime");
        dataChannelRef.current = dataChannel;
        dataChannel.onopen = () => {
          try {
            setDcState("open");
            try { ensureMicSender(peerConnectionRef.current); } catch { }
            try { setDebugEvents((prev) => [{ t: Date.now(), type: "datachannel.open" }, ...prev].slice(0, 30)); } catch { }
            const event = {
              type: "session.update",
              session: {
                instructions: buildInstructions(
                  latestPromptRef.current,
                  language,
                  otherLanguage,
                  platform,
                  agentRole,
                  hostName,
                  (guestList || []).join(", "),
                ),
                tool_choice: "auto",
                // Advertise tools so the agent can call them with arguments
                tools: [
                  {
                    type: "function",
                    name: "start_silence",
                    description: "Silence the agent for a specified number of seconds; the agent should not process inputs or produce outputs during the silent period.",
                    parameters: {
                      type: "object",
                      properties: {
                        seconds: { type: "number", description: "Seconds to remain silent" },
                        duration: { type: "number", description: "Alias for seconds" }
                      },
                      required: []
                    }
                  },
                  {
                    type: "function",
                    name: "stop_silence",
                    description: "End the silent period and resume conversation.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "host_start",
                    description: "Start Host mode: begin music, speak Invite lines periodically, and read Host Content after 5 minutes.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "host_stop",
                    description: "Stop Host mode and any playing music.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "host_invite",
                    description: "Speak the Invite line immediately over the music.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "host_resume",
                    description: "Resume Host mode and continue music/invites.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "host_closing",
                    description: "Speak the Space Closer line and end Host mode.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "media_play",
                    description: "Play the current track in the Media Player (if any).",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "media_stop",
                    description: "Stop/pause any playing media from the Media Player.",
                    parameters: { type: "object", properties: {}, required: [] }
                  },
                  {
                    type: "function",
                    name: "trivia_start",
                    description: "Start a trivia game for 5 rounds with the given players.",
                    parameters: {
                      type: "object",
                      properties: {
                        players: { type: "array", items: { type: "string" }, description: "Player names" }
                      },
                      required: ["players"]
                    }
                  },
                  {
                    type: "function",
                    name: "trivia_answer",
                    description: "Record a player’s answer result for the current trivia question.",
                    parameters: {
                      type: "object",
                      properties: {
                        player: { type: "string", description: "Player name" },
                        correct: { type: "boolean", description: "Whether the answer was correct" }
                      },
                      required: ["player", "correct"]
                    }
                  }
                ],
                voice,
                output_audio_format: "pcm16",
                turn_detection: {
                  threshold: vadThreshold,
                  prefix_padding_ms: vadPrefixMs,
                  silence_duration_ms: vadSilenceMs,
                },
                response: {
                  max_output_tokens: Math.min(2000, maxResponse),
                  temperature,
                },
              },
            } as any;
            dataChannel.send(JSON.stringify(event));
            // Mark start of new conversation context, so history doesn't drag old system prompt
            try {
              dataChannel.send(JSON.stringify({ type: "response.cancel" }));
            } catch { }
            // Follow-up send with a version tag to ensure model applies changes
            setTimeout(() => sendInstructions("Prompt (sync)"), 200);
            try {
              setToolStatus("Prompt applied");
            } catch { }
          } catch { }
          resolve();
        };
        dataChannel.onclose = () => {
          try {
            setDcState("closed");
            try { setDebugEvents((prev) => [{ t: Date.now(), type: "datachannel.close" }, ...prev].slice(0, 30)); } catch { }
          } catch { }
        };
        dataChannel.onerror = (err) => {
          try {
            setDcState("error");
            try { setDebugEvents((prev) => [{ t: Date.now(), type: "datachannel.error", info: String(err) }, ...prev].slice(0, 30)); } catch { }
          } catch { }
        };
        dataChannel.onmessage = (event) => {
          try {
            const ev = JSON.parse(event.data);
            try {
              const type = String(ev?.type || "unknown");
              const name = (ev as any)?.name ?? (ev as any)?.tool?.name ?? undefined;
              let info = "";
              try {
                const argStr = (ev as any)?.arguments ?? (ev as any)?.tool?.arguments ?? "";
                if (typeof argStr === "string" && argStr.length) info = argStr.slice(0, 200);
                else if (typeof (ev as any)?.delta === "string") info = (ev as any).delta.slice(0, 200);
              } catch { }
              setDebugEvents((prev) => [{ t: Date.now(), type, name, info }, ...prev].slice(0, 30));
              // Also log to the browser console for developers
              try { console.log("[CB] Realtime event:", { type, name, info }); } catch { }
            } catch { }

            // Text streaming
            if (
              ev?.type === "response.output_text.delta" &&
              typeof ev.delta === "string"
            ) {
              setSpeakingText((prev) => prev + ev.delta);
            }

            // Function/tool call streaming: accumulate arguments until done, then dispatch
            if (
              ev?.type === "response.function_call" || ev?.type === "response.tool_call"
            ) {
              const callName: string =
                (ev as any)?.name ??
                (ev as any)?.tool?.name ??
                (ev as any)?.function_call?.name ??
                (ev as any)?.tool_call?.name;
              // Some runtimes provide full arguments immediately on response.function_call/tool_call
              const immediateArgStr =
                typeof (ev as any).arguments === "string" && (ev as any).arguments.length > 0
                  ? (ev as any).arguments
                  : typeof (ev as any)?.tool?.arguments === "string" && (ev as any).tool.arguments.length > 0
                    ? (ev as any).tool.arguments
                    : "";
              // Some runtimes provide arguments as an object (not a JSON string)
              const immediateArgObj =
                (typeof (ev as any).arguments === "object" && (ev as any).arguments !== null)
                  ? (ev as any).arguments
                  : (typeof (ev as any)?.tool?.arguments === "object" && (ev as any).tool.arguments !== null)
                    ? (ev as any).tool.arguments
                    : null;
              if (immediateArgStr || immediateArgObj) {
                let args: any = {};
                try {
                  args = immediateArgObj ?? JSON.parse(immediateArgStr);
                } catch {
                  args = immediateArgObj ?? {};
                }
                const resolvedName = inferToolName(callName, args);
                // Log with dedupe
                try {
                  const argsHash = JSON.stringify(args || {}).slice(0, 200);
                  const now = Date.now();
                  const last = lastToolRef.current;
                  if (!last || last.name !== resolvedName || last.argsHash !== argsHash || now - last.t > 1000) {
                    setToolCalls((prev) => [{ name: resolvedName, args, t: now }, ...prev].slice(0, 10));
                    lastToolRef.current = { name: resolvedName, argsHash, t: now };
                  }
                } catch { }
                // Dispatch immediately
                try {
                  // Mark tool as busy during immediate dispatch
                  try {
                    toolBusyCountRef.current += 1;
                    setToolBusy(true);
                    setCurrentTool({ name: resolvedName, started: Date.now() });
                  } catch { }
                  switch (resolvedName) {
                    case "silence":
                    case "start_silence": {
                      const seconds =
                        typeof args?.seconds === "number"
                          ? Math.max(1, Math.floor(args.seconds))
                          : typeof args?.duration === "number"
                            ? Math.max(1, Math.floor(args.duration))
                            : 60;
                      startSilence(seconds);
                      break;
                    }
                    case "stop_silence": {
                      stopSilence();
                      break;
                    }
                    case "host_start": {
                      try { window.dispatchEvent(new CustomEvent("cb:hostStart")); } catch { }
                      break;
                    }
                    case "host_stop": {
                      try { window.dispatchEvent(new CustomEvent("cb:hostStop")); } catch { }
                      break;
                    }
                    case "host_invite": {
                      try { window.dispatchEvent(new CustomEvent("cb:hostInviteNow")); } catch { }
                      break;
                    }
                    case "host_closing": {
                      try { window.dispatchEvent(new CustomEvent("cb:hostClosing")); } catch { }
                      break;
                    }
                    case "host_resume": {
                      try { window.dispatchEvent(new CustomEvent("cb:hostResume")); } catch { }
                      break;
                    }
                    case "media_play": {
                      try {
                        const a = mediaAudioRef.current;
                        if (!a) {
                          try { setToolStatus("Media player not initialized"); } catch { }
                        } else {
                          try { audioCtxRef.current?.resume(); } catch { }
                          a.muted = false;
                          a.loop = false;
                          a.volume = Math.max(0, Math.min(1, a.volume || 1));
                          if (!a.src) {
                            try { setToolStatus("No media source loaded"); } catch { }
                          }
                          a.play()
                            .then(() => { try { setToolStatus("Media playing"); } catch { } })
                            .catch(() => { try { setToolStatus("Playback blocked; click Play in Media Player first"); } catch { } });
                        }
                      } catch { }
                      break;
                    }
                    case "media_stop": {
                      try {
                        const a = mediaAudioRef.current;
                        if (a) {
                          a.pause();
                          a.loop = false;
                          try { setToolStatus("Media paused"); } catch { }
                        } else {
                          try { setToolStatus("Media player not initialized"); } catch { }
                        }
                      } catch { }
                      break;
                    }
                    case "trivia_start": {
                      const players: string[] = Array.isArray(args?.players) ? args.players : [];
                      handleTriviaStart(players);
                      break;
                    }
                    case "trivia_answer": {
                      const player: string = typeof args?.player === "string" ? args.player : "";
                      const correct: boolean = !!args?.correct;
                      if (player) handleTriviaAnswer(player, correct);
                      break;
                    }
                    case "check_availability": {
                      try {
                        const startISO: string = typeof args?.startISO === "string" ? args.startISO : "";
                        const endISO: string = typeof args?.endISO === "string" ? args.endISO : "";
                        const timeZone: string = typeof args?.timeZone === "string" ? args.timeZone : "UTC";
                        if (!startISO || !endISO) {
                          try { setToolStatus("check_availability: missing startISO/endISO"); } catch { }
                        } else {
                          (async () => {
                            try {
                              let calArg: string[] =
                                Array.isArray(args?.calendarIds)
                                  ? args.calendarIds
                                  : typeof args?.calendarIds === "string"
                                    ? String(args.calendarIds).split(",").map((s) => s.trim()).filter(Boolean)
                                    : [];
                              // Fallback: use user's selected calendars from CRM preferences if none provided
                              if (!calArg.length) {
                                try {
                                  const rp = await fetch("/api/calendar/preferences", {
                                    headers: {
                                      "x-wallet": (() => {
                                        try {
                                          const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                          return ((account?.address || "") || fallback).toLowerCase();
                                        } catch {
                                          return (account?.address || "").toLowerCase();
                                        }
                                      })(),
                                    },
                                  });
                                  const jp = await rp.json().catch(() => ({}));
                                  const selected = Array.isArray(jp?.selectedIds) ? jp.selectedIds : [];
                                  if (selected.length) calArg = selected;
                                } catch { }
                              }
                              const calCsv = calArg.length ? calArg.join(",") : "";
                              const u = `/api/calendar/availability?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&timeZone=${encodeURIComponent(timeZone)}${calCsv ? `&calendarIds=${encodeURIComponent(calCsv)}` : ""}`;
                              const walletHdr = (() => {
                                try {
                                  const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                  return ((account?.address || "") || fallback).toLowerCase();
                                } catch {
                                  return (account?.address || "").toLowerCase();
                                }
                              })();
                              const r = await fetch(u, { headers: { "x-wallet": walletHdr } });
                              const j = await r.json().catch(() => ({}));
                              if (!r.ok || j?.ok === false) {
                                const msg = typeof j?.error === "string" ? j.error : "availability_failed";
                                const det = typeof j?.details === "string" ? ` — ${j.details}` : "";
                                try { setToolStatus(`availability error: ${msg}${det}`); } catch { }
                                try { sendToolOutput("check_availability", { ok: false, error: msg, details: typeof j?.details === "string" ? j.details : undefined }); } catch { }
                                return;
                              }
                              const busyList = Array.isArray(j?.busy) ? j.busy : [];
                              const freeList = Array.isArray(j?.free) ? j.free : [];
                              const count = busyList.length;

                              // Detect overlap of proposed window with busy intervals
                              const proposedStartMs = new Date(startISO).getTime();
                              const proposedEndMs = new Date(endISO).getTime();
                              const overlaps = busyList.filter((b: any) => {
                                try {
                                  const bs = new Date(b.start).getTime();
                                  const be = new Date(b.end).getTime();
                                  return proposedStartMs < be && proposedEndMs > bs;
                                } catch {
                                  return false;
                                }
                              });
                              const slotBooked = overlaps.length > 0;

                              // Suggest alternate window (same duration) from free intervals
                              const durationMs = Math.max(0, proposedEndMs - proposedStartMs);
                              let suggestedStartISO: string | undefined;
                              let suggestedEndISO: string | undefined;
                              for (const f of freeList) {
                                try {
                                  const fs = new Date(f.start).getTime();
                                  const fe = new Date(f.end).getTime();
                                  if (fe - fs >= durationMs && fs >= proposedStartMs) {
                                    suggestedStartISO = new Date(fs).toISOString();
                                    suggestedEndISO = new Date(fs + durationMs).toISOString();
                                    break;
                                  }
                                } catch {}
                              }
                              if (!suggestedStartISO) {
                                const f0 = freeList.find((f: any) => {
                                  try {
                                    const fs = new Date(f.start).getTime();
                                    const fe = new Date(f.end).getTime();
                                    return fe - fs >= durationMs;
                                  } catch {
                                    return false;
                                  }
                                });
                                if (f0) {
                                  const fs = new Date(f0.start).getTime();
                                  suggestedStartISO = new Date(fs).toISOString();
                                  suggestedEndISO = new Date(fs + durationMs).toISOString();
                                }
                              }

                              // Fallback: broaden search window beyond the proposed end to find next available slot of same duration
                              if (!suggestedStartISO) {
                                try {
                                  const horizonStartISO = endISO;
                                  const horizonEndISO = new Date(new Date(endISO).getTime() + 8 * 60 * 60 * 1000).toISOString(); // next 8 hours
                                  const u2 =
                                    `/api/calendar/availability` +
                                    `?start=${encodeURIComponent(horizonStartISO)}&end=${encodeURIComponent(horizonEndISO)}&timeZone=${encodeURIComponent(timeZone)}` +
                                    (calCsv ? `&calendarIds=${encodeURIComponent(calCsv)}` : "");
                                  const r2 = await fetch(u2, { headers: { "x-wallet": walletHdr } });
                                  const j2 = await r2.json().catch(() => ({}));
                                  const free2: any[] = Array.isArray(j2?.free) ? j2.free : [];
                                  const nextWindow = free2.find((f: any) => {
                                    try {
                                      const fs = new Date(f.start).getTime();
                                      const fe = new Date(f.end).getTime();
                                      return fe - fs >= durationMs;
                                    } catch {
                                      return false;
                                    }
                                  });
                                  if (nextWindow) {
                                    const fs = new Date(nextWindow.start).getTime();
                                    suggestedStartISO = new Date(fs).toISOString();
                                    suggestedEndISO = new Date(fs + durationMs).toISOString();
                                  }
                                } catch {}
                              }

                              try { setToolStatus(slotBooked ? `availability: BOOKED (${overlaps.length} overlap)` : "availability: free"); } catch { }
                              try { lastAvailabilityRef.current = { startISO, endISO, timeZone }; } catch { }
                              try {
                                sendToolOutput("check_availability", {
                                  ok: true,
                                  startISO,
                                  endISO,
                                  timeZone,
                                  calendarIds: calArg,
                                  count,
                                  slotBooked,
                                  overlaps,
                                  busy: busyList,
                                  free: freeList,
                                  suggestion: slotBooked ? { startISO: suggestedStartISO, endISO: suggestedEndISO } : undefined
                                });
                                // Proactively prompt the agent to speak the result for runtimes that don't emit text after tool calls
                                const summary =
                                  slotBooked
                                    ? `Window ${startISO} to ${endISO} (${timeZone}) is not available.`
                                    : `Window ${startISO} to ${endISO} (${timeZone}) is available.`;
                                const suggestText =
                                  slotBooked && suggestedStartISO && suggestedEndISO
                                    ? ` Suggestion: ${new Date(suggestedStartISO).toLocaleString()} to ${new Date(suggestedEndISO).toLocaleString()} (${timeZone}).`
                                    : "";
                                try { sendDeveloper(`Announce availability: ${summary}${suggestText}`); } catch { }
                                try { sendUserMessage(`Availability check: ${summary}${suggestText}`); } catch { }
                                try { sendDeveloper(`[availability_result] ${JSON.stringify({ startISO, endISO, timeZone, slotBooked, overlapsCount: overlaps.length, suggestion: (slotBooked && suggestedStartISO && suggestedEndISO) ? { startISO: suggestedStartISO, endISO: suggestedEndISO } : undefined })}`); } catch { }

                                // Auto-schedule when the model provided schedule fields and the slot is free,
                                // or schedule at the suggested alternate if the proposed slot is booked.
                                const hasScheduleFields =
                                  typeof args?.title === "string" ||
                                  typeof args?.location === "string" ||
                                  Array.isArray(args?.guests) ||
                                  Array.isArray(args?.reminders) ||
                                  typeof args?.conferenceType === "string" ||
                                  typeof args?.description === "string";

                                if (hasScheduleFields) {
                                  // Construct schedule payload from provided fields
                                  const basePayload: any = {
                                    leadId: typeof args?.leadId === "string" ? args.leadId : "",
                                    title: typeof args?.title === "string" ? args.title : "Meeting",
                                    description: typeof args?.description === "string" ? args.description : undefined,
                                    location: typeof args?.location === "string" ? args.location : undefined,
                                    timeZone: typeof args?.timeZone === "string" ? args.timeZone : timeZone,
                                    guests: Array.isArray(args?.guests) ? args.guests : [],
                                    organizerEmail: typeof args?.organizerEmail === "string" ? args.organizerEmail : undefined,
                                    conferenceType: typeof args?.conferenceType === "string" ? args.conferenceType : "google_meet",
                                    reminders: Array.isArray(args?.reminders) ? args.reminders : undefined,
                                    calendarId: typeof args?.calendarId === "string" ? args.calendarId : undefined,
                                  };

                                  // Choose window: proposed if free, otherwise suggestion if available
                                  const schedStart = !slotBooked ? startISO : suggestedStartISO;
                                  const schedEnd = !slotBooked ? endISO : suggestedEndISO;
                                  if (schedStart && schedEnd) {
                                    const payload = { ...basePayload, startISO: schedStart, endISO: schedEnd };
                                    try {
                                      // Log synthetic schedule_meeting tool call so RECENT TOOL CALLS shows it distinctly
                                      try {
                                        setToolCalls((prev) => [{ name: "schedule_meeting", args: payload, t: Date.now() }, ...prev].slice(0, 10));
                                        lastToolRef.current = { name: "schedule_meeting", argsHash: JSON.stringify(payload).slice(0, 200), t: Date.now() };
                                      } catch {}
                                      const sr = await fetch("/api/crm/schedule", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", "x-wallet": walletHdr },
                                        body: JSON.stringify(payload),
                                      });
                                      const txt = await sr.text();
                                      let sj: any = {};
                                      try { sj = JSON.parse(txt); } catch { }
                                      if (sr.ok) {
                                        const link = sj?.hangoutLink || sj?.htmlLink || "";
                                        try { setToolStatus(link ? `scheduled: ${link}` : "scheduled"); } catch { }
                                        try { sendToolOutput("schedule_meeting", { ok: true, event: sj, link }); } catch { }
                                        try { sendDeveloper(`Meeting scheduled: ${link || "no link"}`); } catch { }
                                        try { sendUserMessage(`Meeting scheduled for ${new Date(schedStart).toLocaleString()} to ${new Date(schedEnd).toLocaleString()} (${payload.timeZone}).`); } catch { }
                                      } else {
                                        try { setToolStatus(`schedule error: ${sj?.error || txt || sr.status}`); } catch { }
                                        try { sendToolOutput("schedule_meeting", { ok: false, error: sj?.error || txt || sr.status }); } catch { }
                                      }
                                    } catch {
                                      try { setToolStatus("schedule_meeting: network error"); } catch { }
                                    }
                                  } else {
                                    try { setToolStatus("no availability found: cannot auto-schedule"); } catch { }
                                  }
                                }
                              } catch { }
                            } catch {
                              try { setToolStatus("availability: network error"); } catch { }
                            }
                          })();
                        }
                      } catch { }
                      break;
                    }
                    case "schedule_meeting": {
                      try {
                        const payload: any = {
                          leadId: typeof args?.leadId === "string" ? args.leadId : "",
                          title: typeof args?.title === "string" ? args.title : undefined,
                          description: typeof args?.description === "string" ? args.description : undefined,
                          location: typeof args?.location === "string" ? args.location : undefined,
                          startISO: typeof args?.startISO === "string" ? args.startISO : undefined,
                          endISO: typeof args?.endISO === "string" ? args.endISO : undefined,
                          timeZone: typeof args?.timeZone === "string" ? args.timeZone : undefined,
                          guests: Array.isArray(args?.guests) ? args.guests : undefined,
                          organizerEmail: typeof args?.organizerEmail === "string" ? args.organizerEmail : undefined,
                          conferenceType: typeof args?.conferenceType === "string" ? args.conferenceType : undefined,
                          reminders: Array.isArray(args?.reminders) ? args.reminders : undefined,
                          calendarId: typeof args?.calendarId === "string" ? args.calendarId : undefined,
                          // Back-compat
                          datetime: typeof args?.datetime === "string" ? args.datetime : undefined,
                          timezone: typeof args?.timezone === "string" ? args.timezone : undefined,
                        };
                        if (!payload.leadId) {
                          try { setToolStatus("schedule_meeting: missing leadId"); } catch { }
                        } else {
                          (async () => {
                            try {
                              // Use browser timezone if not provided
                              if (!payload.timeZone) {
                                try { payload.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { }
                              }
                              // Fill missing times from last availability window if provided
                              if (!payload.startISO && lastAvailabilityRef.current) { payload.startISO = lastAvailabilityRef.current.startISO; }
                              if (!payload.endISO && lastAvailabilityRef.current) { payload.endISO = lastAvailabilityRef.current.endISO; }
                              // If no explicit calendarId, use user's default from CRM preferences
                              if (!payload.calendarId) {
                                try {
                                  const rp = await fetch("/api/calendar/preferences", {
                                    headers: {
                                      "x-wallet": (() => {
                                        try {
                                          const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                          return ((account?.address || "") || fallback).toLowerCase();
                                        } catch {
                                          return (account?.address || "").toLowerCase();
                                        }
                                      })(),
                                    },
                                  });
                                  const jp = await rp.json().catch(() => ({}));
                                  const def = typeof jp?.defaultId === "string" ? jp.defaultId : undefined;
                                  if (def) payload.calendarId = def;
                                } catch { }
                              }
                              const r = await fetch("/api/crm/schedule", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                              });
                              const txt = await r.text();
                              let j: any = {};
                              try { j = JSON.parse(txt); } catch { }
                              if (r.ok) {
                                const link = j?.hangoutLink || j?.htmlLink || "";
                                try { setToolStatus(link ? `scheduled: ${link}` : "scheduled"); } catch { }
                                try { sendToolOutput("schedule_meeting", { ok: true, event: j, link }); } catch { }
                              } else {
                                try { setToolStatus(`schedule error: ${j?.error || txt || r.status}`); } catch { }
                                try { sendToolOutput("schedule_meeting", { ok: false, error: j?.error || txt || r.status }); } catch { }
                              }
                            } catch {
                              try { setToolStatus("schedule_meeting: network error"); } catch { }
                            }
                          })();
                        }
                      } catch { }
                      break;
                    }
                    default: {
                      break;
                    }
                  }
                } catch { }
                try { dataChannelRef.current?.send(JSON.stringify({ type: "response.create" })); } catch { }
                // Clear busy status after immediate dispatch
                try {
                  toolBusyCountRef.current = Math.max(0, toolBusyCountRef.current - 1);
                  if (toolBusyCountRef.current === 0) {
                    setToolBusy(false);
                    setCurrentTool(null);
                  }
                } catch { }
              } else {
                // No immediate args provided. Some tools (e.g., media_play, media_stop, host_* ) are arg-less.
                const resolvedHeaderName = inferToolName(callName, {});
                const noArgTools = new Set([
                  "media_play",
                  "media_stop",
                  "host_start",
                  "host_stop",
                  "host_invite",
                  "host_resume",
                  "host_closing",
                  "stop_silence",
                ]);

                if (noArgTools.has(resolvedHeaderName)) {
                  // Log and dispatch immediately with empty args
                  try {
                    const now = Date.now();
                    const args: any = {};
                    const argsHash = "{}";
                    const last = lastToolRef.current;
                    if (!last || last.name !== resolvedHeaderName || last.argsHash !== argsHash || now - last.t > 1000) {
                      setToolCalls((prev) => [{ name: resolvedHeaderName, args, t: now }, ...prev].slice(0, 10));
                      lastToolRef.current = { name: resolvedHeaderName, argsHash, t: now };
                    }
                  } catch { }

                  // Mark busy during immediate dispatch
                  try {
                    toolBusyCountRef.current += 1;
                    setToolBusy(true);
                    setCurrentTool({ name: resolvedHeaderName, started: Date.now() });
                  } catch { }

                  // Dispatch the tool (no args)
                  try {
                    switch (resolvedHeaderName) {
                      case "stop_silence": {
                        stopSilence();
                        break;
                      }
                      case "host_start": {
                        try { window.dispatchEvent(new CustomEvent("cb:hostStart")); } catch { }
                        break;
                      }
                      case "host_stop": {
                        try { window.dispatchEvent(new CustomEvent("cb:hostStop")); } catch { }
                        break;
                      }
                      case "host_invite": {
                        try { window.dispatchEvent(new CustomEvent("cb:hostInviteNow")); } catch { }
                        break;
                      }
                      case "host_resume": {
                        try { window.dispatchEvent(new CustomEvent("cb:hostResume")); } catch { }
                        break;
                      }
                      case "host_closing": {
                        try { window.dispatchEvent(new CustomEvent("cb:hostClosing")); } catch { }
                        break;
                      }
                      case "media_play": {
                        try {
                          const a = mediaAudioRef.current;
                          if (!a) {
                            try { setToolStatus("Media player not initialized"); } catch { }
                          } else {
                            try { audioCtxRef.current?.resume(); } catch { }
                            a.muted = false;
                            a.loop = false;
                            a.volume = Math.max(0, Math.min(1, a.volume || 1));
                            if (!a.src) {
                              try { setToolStatus("No media source loaded"); } catch { }
                            }
                            a.play()
                              .then(() => { try { setToolStatus("Media playing"); } catch { } })
                              .catch(() => { try { setToolStatus("Playback blocked; click Play in Media Player first"); } catch { } });
                          }
                        } catch { }
                        break;
                      }
                      case "media_stop": {
                        try {
                          const a = mediaAudioRef.current;
                          if (a) {
                            a.pause();
                            a.loop = false;
                            try { setToolStatus("Media paused"); } catch { }
                          } else {
                            try { setToolStatus("Media player not initialized"); } catch { }
                          }
                        } catch { }
                        break;
                      }
                      default: {
                        // Unknown no-arg tool: no-op
                        break;
                      }
                    }
                  } catch { }

                  // Prompt assistant to continue and clear busy
                  try { dataChannelRef.current?.send(JSON.stringify({ type: "response.create" })); } catch { }
                  try {
                    toolBusyCountRef.current = Math.max(0, toolBusyCountRef.current - 1);
                    if (toolBusyCountRef.current === 0) {
                      setToolBusy(false);
                      setCurrentTool(null);
                    }
                  } catch { }
                } else {
                  // Fallback to streaming args path
                  fnCallAccRef.current = { name: resolvedHeaderName, arguments: "" };

                  // Mark tool as busy while streaming arguments
                  try {
                    toolBusyCountRef.current += 1;
                    setToolBusy(true);
                    setCurrentTool({ name: resolvedHeaderName, started: Date.now() });
                  } catch { }

                  // Start silence immediately with a default to show the Resume button promptly;
                  // the final duration will be applied when arguments are received.
                  if (resolvedHeaderName === "start_silence") {
                    startSilence(60);
                  }

                  // Provisional tool log so UI shows "Last tool" immediately
                  try {
                    const now = Date.now();
                    const args = { pending: true };
                    const argsHash = "PENDING";
                    const last = lastToolRef.current;
                    if (!last || last.name !== resolvedHeaderName || last.argsHash !== argsHash || now - last.t > 1000) {
                      setToolCalls((prev) => [{ name: resolvedHeaderName, args, t: now }, ...prev].slice(0, 10));
                      lastToolRef.current = { name: resolvedHeaderName, argsHash, t: now };
                    }
                  } catch { }
                }
              }
            } else if (
              (
                ev?.type === "response.function_call.arguments.delta" ||
                ev?.type === "response.tool_call.arguments.delta" ||
                ev?.type === "response.function_call_arguments.delta" ||
                ev?.type === "response.tool_call_arguments.delta"
              ) &&
              typeof ev.delta === "string"
            ) {
              // Initialize accumulator if missing (underscore variants may not send the function_call header)
              if (!fnCallAccRef.current) {
                const rawName: string =
                  (ev as any)?.name ??
                  (ev as any)?.tool?.name ??
                  "unknown";
                const resolvedNameInit = inferToolName(rawName, {});
                fnCallAccRef.current = { name: resolvedNameInit, arguments: "" };
                // Mark busy and provisional log
                try {
                  toolBusyCountRef.current += 1;
                  setToolBusy(true);
                  setCurrentTool({ name: resolvedNameInit, started: Date.now() });
                } catch { }
                try {
                  const now = Date.now();
                  const args = { pending: true };
                  const argsHash = "PENDING";
                  const last = lastToolRef.current;
                  if (!last || last.name !== resolvedNameInit || last.argsHash !== argsHash || now - last.t > 1000) {
                    setToolCalls((prev) => [{ name: resolvedNameInit, args, t: now }, ...prev].slice(0, 10));
                    lastToolRef.current = { name: resolvedNameInit, argsHash, t: now };
                  }
                } catch { }
              }
              fnCallAccRef.current.arguments += ev.delta;
            } else if (
              ev?.type === "response.function_call.arguments.done" ||
              ev?.type === "response.tool_call.arguments.done" ||
              ev?.type === "response.function_call_arguments.done" ||
              ev?.type === "response.tool_call_arguments.done"
            ) {
              const acc = fnCallAccRef.current;
              fnCallAccRef.current = null;
              if (acc && typeof acc.name === "string") {
                let args: any = {};
                try {
                  args = acc.arguments ? JSON.parse(acc.arguments) : {};
                } catch {
                  args = {};
                }
                try {
                  const nameResolved = inferToolName(acc.name, args);
                  // Log tool call (dedupe within 1s)
                  try {
                    const argsHash = JSON.stringify(args || {}).slice(0, 200);
                    const now = Date.now();
                    const last = lastToolRef.current;
                    if (!last || last.name !== nameResolved || last.argsHash !== argsHash || now - last.t > 1000) {
                      setToolCalls((prev) => [{ name: nameResolved, args, t: now }, ...prev].slice(0, 10));
                      lastToolRef.current = { name: nameResolved, argsHash, t: now };
                    }
                  } catch { }
                  switch (nameResolved) {
                    // Silence tools
                    case "silence":
                    case "start_silence": {
                      const seconds =
                        typeof args?.seconds === "number"
                          ? Math.max(1, Math.floor(args.seconds))
                          : typeof args?.duration === "number"
                            ? Math.max(1, Math.floor(args.duration))
                            : 60;
                      startSilence(seconds);
                      break;
                    }
                    case "stop_silence": {
                      stopSilence();
                      break;
                    }

                    // Host mode tools (dispatch to HostModePanel via window events)
                    case "host_start": {
                      try {
                        window.dispatchEvent(new CustomEvent("cb:hostStart"));
                      } catch { }
                      break;
                    }
                    case "host_stop": {
                      try {
                        window.dispatchEvent(new CustomEvent("cb:hostStop"));
                      } catch { }
                      break;
                    }
                    case "host_invite": {
                      try {
                        window.dispatchEvent(new CustomEvent("cb:hostInviteNow"));
                      } catch { }
                      break;
                    }
                    case "host_closing": {
                      try {
                        window.dispatchEvent(new CustomEvent("cb:hostClosing"));
                      } catch { }
                      break;
                    }
                    case "host_resume": {
                      try {
                        window.dispatchEvent(new CustomEvent("cb:hostResume"));
                      } catch { }
                      break;
                    }
                    case "media_play": {
                      try {
                        const a = mediaAudioRef.current;
                        if (!a) {
                          try { setToolStatus("Media player not initialized"); } catch { }
                        } else {
                          try { audioCtxRef.current?.resume(); } catch { }
                          a.muted = false;
                          a.loop = false;
                          a.volume = Math.max(0, Math.min(1, a.volume || 1));
                          if (!a.src) {
                            try { setToolStatus("No media source loaded"); } catch { }
                          }
                          a.play()
                            .then(() => { try { setToolStatus("Media playing"); } catch { } })
                            .catch(() => { try { setToolStatus("Playback blocked; click Play in Media Player first"); } catch { } });
                        }
                      } catch { }
                      break;
                    }
                    case "media_stop": {
                      try {
                        const a = mediaAudioRef.current;
                        if (a) {
                          a.pause();
                          a.loop = false;
                          try { setToolStatus("Media paused"); } catch { }
                        } else {
                          try { setToolStatus("Media player not initialized"); } catch { }
                        }
                      } catch { }
                      break;
                    }

                    // Trivia tools
                    case "trivia_start": {
                      const players: string[] = Array.isArray(args?.players)
                        ? args.players
                        : [];
                      handleTriviaStart(players);
                      break;
                    }
                    case "trivia_answer": {
                      const player: string = typeof args?.player === "string" ? args.player : "";
                      const correct: boolean = !!args?.correct;
                      if (player) handleTriviaAnswer(player, correct);
                      break;
                    }
                    case "check_availability": {
                      try {
                        const startISO: string = typeof args?.startISO === "string" ? args.startISO : "";
                        const endISO: string = typeof args?.endISO === "string" ? args.endISO : "";
                        const timeZone: string = typeof args?.timeZone === "string" ? args.timeZone : "UTC";
                        if (!startISO || !endISO) {
                          try { setToolStatus("check_availability: missing startISO/endISO"); } catch { }
                        } else {
                          (async () => {
                            try {
                              let calArg: string[] =
                                Array.isArray(args?.calendarIds)
                                  ? args.calendarIds
                                  : typeof args?.calendarIds === "string"
                                    ? String(args.calendarIds).split(",").map((s) => s.trim()).filter(Boolean)
                                    : [];
                              // Fallback: use user's selected calendars from CRM preferences if none provided
                              if (!calArg.length) {
                                try {
                                  const rp = await fetch("/api/calendar/preferences", {
                                    headers: {
                                      "x-wallet": (() => {
                                        try {
                                          const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                          return ((account?.address || "") || fallback).toLowerCase();
                                        } catch {
                                          return (account?.address || "").toLowerCase();
                                        }
                                      })(),
                                    },
                                  });
                                  const jp = await rp.json().catch(() => ({}));
                                  const selected = Array.isArray(jp?.selectedIds) ? jp.selectedIds : [];
                                  if (selected.length) calArg = selected;
                                } catch { }
                              }
                              const calCsv = calArg.length ? calArg.join(",") : "";
                              const u = `/api/calendar/availability?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&timeZone=${encodeURIComponent(timeZone)}${calCsv ? `&calendarIds=${encodeURIComponent(calCsv)}` : ""}`;
                              const walletHdr = (() => {
                                try {
                                  const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                  return ((account?.address || "") || fallback).toLowerCase();
                                } catch {
                                  return (account?.address || "").toLowerCase();
                                }
                              })();
                              const r = await fetch(u, { headers: { "x-wallet": walletHdr } });
                              const j = await r.json().catch(() => ({}));
                              if (!r.ok || j?.ok === false) {
                                const msg = typeof j?.error === "string" ? j.error : "availability_failed";
                                const det = typeof j?.details === "string" ? ` — ${j.details}` : "";
                                try { setToolStatus(`availability error: ${msg}${det}`); } catch { }
                                try { sendToolOutput("check_availability", { ok: false, error: msg, details: typeof j?.details === "string" ? j.details : undefined }); } catch { }
                                return;
                              }
                              const busyList = Array.isArray(j?.busy) ? j.busy : [];
                              const freeList = Array.isArray(j?.free) ? j.free : [];
                              const count = busyList.length;

                              // Detect overlap of proposed window with busy intervals
                              const proposedStartMs = new Date(startISO).getTime();
                              const proposedEndMs = new Date(endISO).getTime();
                              const overlaps = busyList.filter((b: any) => {
                                try {
                                  const bs = new Date(b.start).getTime();
                                  const be = new Date(b.end).getTime();
                                  return proposedStartMs < be && proposedEndMs > bs;
                                } catch {
                                  return false;
                                }
                              });
                              const slotBooked = overlaps.length > 0;

                              // Suggest alternate window (same duration) from free intervals
                              const durationMs = Math.max(0, proposedEndMs - proposedStartMs);
                              let suggestedStartISO: string | undefined;
                              let suggestedEndISO: string | undefined;
                              for (const f of freeList) {
                                try {
                                  const fs = new Date(f.start).getTime();
                                  const fe = new Date(f.end).getTime();
                                  if (fe - fs >= durationMs && fs >= proposedStartMs) {
                                    suggestedStartISO = new Date(fs).toISOString();
                                    suggestedEndISO = new Date(fs + durationMs).toISOString();
                                    break;
                                  }
                                } catch {}
                              }
                              if (!suggestedStartISO) {
                                const f0 = freeList.find((f: any) => {
                                  try {
                                    const fs = new Date(f.start).getTime();
                                    const fe = new Date(f.end).getTime();
                                    return fe - fs >= durationMs;
                                  } catch {
                                    return false;
                                  }
                                });
                                if (f0) {
                                  const fs = new Date(f0.start).getTime();
                                  suggestedStartISO = new Date(fs).toISOString();
                                  suggestedEndISO = new Date(fs + durationMs).toISOString();
                                }
                              }

                              try { setToolStatus(slotBooked ? `availability: BOOKED (${overlaps.length} overlap)` : "availability: free"); } catch { }
                              try { lastAvailabilityRef.current = { startISO, endISO, timeZone }; } catch { }
                              try {
                                sendToolOutput("check_availability", {
                                  ok: true,
                                  startISO,
                                  endISO,
                                  timeZone,
                                  calendarIds: calArg,
                                  count,
                                  slotBooked,
                                  overlaps,
                                  busy: busyList,
                                  free: freeList,
                                  suggestion: slotBooked ? { startISO: suggestedStartISO, endISO: suggestedEndISO } : undefined
                                });
                                // Proactively prompt the agent to speak the result for runtimes that don't emit text after tool calls
                                const summary =
                                  slotBooked
                                    ? `Window ${startISO} to ${endISO} (${timeZone}) is not available.`
                                    : `Window ${startISO} to ${endISO} (${timeZone}) is available.`;
                                const suggestText =
                                  slotBooked && suggestedStartISO && suggestedEndISO
                                    ? ` Suggestion: ${new Date(suggestedStartISO).toLocaleString()} to ${new Date(suggestedEndISO).toLocaleString()} (${timeZone}).`
                                    : "";
                                try { sendDeveloper(`Announce availability: ${summary}${suggestText}`); } catch { }
                                try { sendUserMessage(`Availability check: ${summary}${suggestText}`); } catch { }
                                try { sendDeveloper(`[availability_result] ${JSON.stringify({ startISO, endISO, timeZone, slotBooked, overlapsCount: overlaps.length, suggestion: (slotBooked && suggestedStartISO && suggestedEndISO) ? { startISO: suggestedStartISO, endISO: suggestedEndISO } : undefined })}`); } catch { }

                                // Auto-schedule when the model provided schedule fields and the slot is free,
                                // or schedule at the suggested alternate if the proposed slot is booked.
                                const hasScheduleFields =
                                  typeof args?.title === "string" ||
                                  typeof args?.location === "string" ||
                                  Array.isArray(args?.guests) ||
                                  Array.isArray(args?.reminders) ||
                                  typeof args?.conferenceType === "string" ||
                                  typeof args?.description === "string";

                                if (hasScheduleFields) {
                                  // Construct schedule payload from provided fields
                                  const basePayload: any = {
                                    leadId: typeof args?.leadId === "string" ? args.leadId : "",
                                    title: typeof args?.title === "string" ? args.title : "Meeting",
                                    description: typeof args?.description === "string" ? args.description : undefined,
                                    location: typeof args?.location === "string" ? args.location : undefined,
                                    timeZone: typeof args?.timeZone === "string" ? args.timeZone : timeZone,
                                    guests: Array.isArray(args?.guests) ? args.guests : [],
                                    organizerEmail: typeof args?.organizerEmail === "string" ? args.organizerEmail : undefined,
                                    conferenceType: typeof args?.conferenceType === "string" ? args.conferenceType : "google_meet",
                                    reminders: Array.isArray(args?.reminders) ? args.reminders : undefined,
                                    calendarId: typeof args?.calendarId === "string" ? args.calendarId : undefined,
                                  };

                                  // Choose window: proposed if free, otherwise suggestion if available
                                  const schedStart = !slotBooked ? startISO : suggestedStartISO;
                                  const schedEnd = !slotBooked ? endISO : suggestedEndISO;
                                  if (schedStart && schedEnd) {
                                    const payload = { ...basePayload, startISO: schedStart, endISO: schedEnd };
                                    try {
                                      // Log synthetic schedule_meeting tool call so RECENT TOOL CALLS shows it distinctly
                                      try {
                                        setToolCalls((prev) => [{ name: "schedule_meeting", args: payload, t: Date.now() }, ...prev].slice(0, 10));
                                        lastToolRef.current = { name: "schedule_meeting", argsHash: JSON.stringify(payload).slice(0, 200), t: Date.now() };
                                      } catch {}
                                      const sr = await fetch("/api/crm/schedule", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", "x-wallet": (() => {
                                          try {
                                            const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                            return ((account?.address || "") || fallback).toLowerCase();
                                          } catch {
                                            return (account?.address || "").toLowerCase();
                                          }
                                        })() },
                                        body: JSON.stringify(payload),
                                      });
                                      const txt = await sr.text();
                                      let sj: any = {};
                                      try { sj = JSON.parse(txt); } catch { }
                                      if (sr.ok) {
                                        const link = sj?.hangoutLink || sj?.htmlLink || "";
                                        try { setToolStatus(link ? `scheduled: ${link}` : "scheduled"); } catch { }
                                        try { sendToolOutput("schedule_meeting", { ok: true, event: sj, link }); } catch { }
                                        try { sendDeveloper(`Meeting scheduled: ${link || "no link"}`); } catch { }
                                        try { sendUserMessage(`Meeting scheduled for ${new Date(schedStart).toLocaleString()} to ${new Date(schedEnd).toLocaleString()} (${payload.timeZone}).`); } catch { }
                                      } else {
                                        try { setToolStatus(`schedule error: ${sj?.error || txt || sr.status}`); } catch { }
                                        try { sendToolOutput("schedule_meeting", { ok: false, error: sj?.error || txt || sr.status }); } catch { }
                                        try { sendDeveloper(`Schedule error: ${sj?.error || txt || sr.status}`); } catch { }
                                      }
                                    } catch {
                                      try { setToolStatus("schedule_meeting: network error"); } catch { }
                                    }
                                  } else {
                                    try { setToolStatus("no availability found: cannot auto-schedule"); } catch { }
                                  }
                                }
                              } catch { }
                            } catch {
                              try { setToolStatus("availability: network error"); } catch { }
                              try { sendToolOutput("check_availability", { ok: false, error: "network_error" }); } catch { }
                            }
                          })();
                        }
                      } catch { }
                      break;
                    }
                    case "schedule_meeting": {
                      try {
                        const payload: any = {
                          leadId: typeof args?.leadId === "string" ? args.leadId : "",
                          title: typeof args?.title === "string" ? args.title : undefined,
                          description: typeof args?.description === "string" ? args.description : undefined,
                          location: typeof args?.location === "string" ? args.location : undefined,
                          startISO: typeof args?.startISO === "string" ? args.startISO : undefined,
                          endISO: typeof args?.endISO === "string" ? args.endISO : undefined,
                          timeZone: typeof args?.timeZone === "string" ? args.timeZone : undefined,
                          guests: Array.isArray(args?.guests) ? args.guests : undefined,
                          organizerEmail: typeof args?.organizerEmail === "string" ? args.organizerEmail : undefined,
                          conferenceType: typeof args?.conferenceType === "string" ? args.conferenceType : undefined,
                          reminders: Array.isArray(args?.reminders) ? args.reminders : undefined,
                          calendarId: typeof args?.calendarId === "string" ? args.calendarId : undefined,
                          // Back-compat
                          datetime: typeof args?.datetime === "string" ? args.datetime : undefined,
                          timezone: typeof args?.timezone === "string" ? args.timezone : undefined,
                        };
                        if (!payload.leadId) {
                          try { setToolStatus("schedule_meeting: missing leadId"); } catch { }
                        } else {
                          (async () => {
                            try {
                              // Use browser timezone if not provided
                              if (!payload.timeZone) {
                                try { payload.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { }
                              }
                              // If no explicit calendarId, use user's default from CRM preferences
                              if (!payload.calendarId) {
                                try {
                                  const rp = await fetch("/api/calendar/preferences", {
                                    headers: {
                                      "x-wallet": (() => {
                                        try {
                                          const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                                          return ((account?.address || "") || fallback).toLowerCase();
                                        } catch {
                                          return (account?.address || "").toLowerCase();
                                        }
                                      })(),
                                    },
                                  });
                                  const jp = await rp.json().catch(() => ({}));
                                  const def = typeof jp?.defaultId === "string" ? jp.defaultId : undefined;
                                  if (def) payload.calendarId = def;
                                } catch { }
                              }
                              const r = await fetch("/api/crm/schedule", {
                                method: "POST",
                              headers: { "Content-Type": "application/json", "x-wallet": (() => { try { const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : ""; return ((account?.address || "") || fallback).toLowerCase(); } catch { return (account?.address || "").toLowerCase(); } })() },
                                body: JSON.stringify(payload),
                              });
                              const txt = await r.text();
                              let j: any = {};
                              try { j = JSON.parse(txt); } catch { }
                              if (r.ok) {
                                const link = j?.hangoutLink || j?.htmlLink || "";
                                try { setToolStatus(link ? `scheduled: ${link}` : "scheduled"); } catch { }
                                try { sendToolOutput("schedule_meeting", { ok: true, event: j, link }); } catch { }
                              } else {
                                try { setToolStatus(`schedule error: ${j?.error || txt || r.status}`); } catch { }
                                try { sendToolOutput("schedule_meeting", { ok: false, error: j?.error || txt || r.status }); } catch { }
                                try { sendDeveloper(`Schedule error: ${j?.error || txt || r.status}`); } catch { }
                              }
                            } catch {
                              try { setToolStatus("schedule_meeting: network error"); } catch { }
                            }
                          })();
                        }
                      } catch { }
                      break;
                    }

                    default: {
                      // Unknown tool call; no-op
                      break;
                    }
                  }
                } catch { }
                // After executing a tool, prompt the assistant to continue
                try {
                  dataChannelRef.current?.send(JSON.stringify({ type: "response.create" }));
                } catch { }
                // Clear busy status after streamed dispatch
                try {
                  toolBusyCountRef.current = Math.max(0, toolBusyCountRef.current - 1);
                  if (toolBusyCountRef.current === 0) {
                    setToolBusy(false);
                    setCurrentTool(null);
                  }
                } catch { }
              }
            }

            // Response done: clear speaking text and log
            if (ev?.type === "response.done") {
              setTimeout(() => setSpeakingText(""), 400);
              // Log assistant message (best effort)
              try {
                const text = speakingRef.current;
                const w = (account?.address || "").toLowerCase();
                if (w && text) {
                  fetch("/api/conversations/log", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-wallet": w },
                    body: JSON.stringify({
                      wallet: w,
                      role: "assistant",
                      text,
                      embed: true,
                    }),
                  }).catch(() => { });
                }
              } catch { }
            }
          } catch { }
        };
        const webrtcUrl = process.env
          .NEXT_PUBLIC_AZURE_OPENAI_REALTIME_WEBRTC_URL as string;
        const deployment = process.env
          .NEXT_PUBLIC_AZURE_OPENAI_REALTIME_DEPLOYMENT as string;
        const apiVersion =
          process.env.NEXT_PUBLIC_AZURE_OPENAI_REALTIME_API_VERSION ||
          process.env.NEXT_PUBLIC_AZURE_OPENAI_API_VERSION ||
          "2024-10-21-preview";
        if (!webrtcUrl || !deployment)
          throw new Error("Realtime env not configured");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        async function tryFetchAnswer(): Promise<{ sdp: string }> {
          // Build URL with proper query keys for Azure vs OpenAI
          const u = new URL(webrtcUrl);
          const isAzure = /openai\.azure\.com/i.test(u.hostname);
          if (isAzure) {
            u.searchParams.set("deployment", deployment);
            u.searchParams.set("api-version", apiVersion);
          } else {
            u.searchParams.set("model", deployment);
          }
          // Attempt 1: SDP-in/sdp-out
          try {
            const headers1: any = {
              "Content-Type": "application/sdp",
              Accept: "application/sdp",
            };
            if (isAzure) headers1["api-key"] = ephemeralKey;
            else headers1["Authorization"] = `Bearer ${ephemeralKey}`;
            const r = await fetch(u.toString(), {
              method: "POST",
              body: offer.sdp || "",
              headers: headers1,
            });
            const txt = await r.text();
            if (r.ok && /\nv=0/.test(`\n${txt}`)) return { sdp: txt };
            // Keep a hint for UI if not SDP
            setToolStatus(
              `Realtime answer not SDP (${r.status}): ${txt.slice(0, 140)}`,
            );
          } catch (e: any) {
            setToolStatus(
              `Realtime fetch failed (SDP): ${e?.message || "error"}`,
            );
          }
          // Attempt 2: JSON-in/JSON-out
          try {
            const body = isAzure
              ? { sdp: offer.sdp, type: "offer", deployment }
              : { sdp: offer.sdp, type: "offer", model: deployment };
            const headers2: any = {
              "Content-Type": "application/json",
              Accept: "application/json",
            };
            if (isAzure) headers2["api-key"] = ephemeralKey;
            else headers2["Authorization"] = `Bearer ${ephemeralKey}`;
            const r = await fetch(u.toString(), {
              method: "POST",
              body: JSON.stringify(body),
              headers: headers2,
            });
            const data = await r.json().catch(() => ({}));
            const ans = (data &&
              (data.sdp || data.answer || data.answer_sdp || "")) as string;
            if (r.ok && ans && /\nv=0/.test(`\n${ans}`)) return { sdp: ans };
            throw new Error(`Unexpected answer format (${r.status})`);
          } catch (e: any) {
            throw new Error(
              `Realtime answer invalid: ${e?.message || "error"}`,
            );
          }
        }
        const answer = await tryFetchAnswer();
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        } catch (e: any) {
          setToolStatus(
            `Failed to setRemoteDescription: ${e?.message || "invalid answer"}`,
          );
          throw e;
        }
      });
    },
    [startMeter, systemPrompt, voice, useMicInput, selectedInputId],
  );
  const startSession = useCallback(async () => {
    try {
      const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
      const headerWallet = ((account?.address || "") || fallback).toLowerCase();
      const headers: any = { "Content-Type": "application/json" };
      if (headerWallet) headers["x-wallet"] = headerWallet;

      // Attempt to pull latest System Prompt from CRM for this wallet before starting
      try {
        const w = headerWallet;
        if (w) {
          const rPull = await fetch("/api/crm/prompt/pull", {
            headers: { "x-wallet": w },
          });
          const jPull = await rPull.json().catch(() => ({}));
          const p = jPull?.stored?.prompt || jPull?.prompt || "";
          if (rPull.ok && typeof p === "string" && p.trim()) {
            setSystemPrompt(p);
            latestPromptRef.current = p;
            setToolStatus("Pulled System Prompt from CRM");
          }
        }
      } catch { }

      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ voice, wallet: headerWallet }),
      });
      if (!res.ok) {
        let reason = "";
        try {
          const j = await res.json();
          reason = j?.error || j?.reason || "";
        } catch {
          try {
            reason = await res.text();
          } catch { }
        }
        setToolStatus(`Session error: ${reason || res.statusText || "failed"}`);
        throw new Error(reason || "Failed to create session");
      }
      const data = await res.json();
      const key = data?.client_secret?.value;
      if (!key) throw new Error("No ephemeral key");
      const shouldCaptureMic = useMicInput;
      setMicCaptureActive(shouldCaptureMic);
      micCaptureActiveRef.current = shouldCaptureMic;
      if (shouldCaptureMic) {
        try {
          await ensureMicRef.current();
        } catch { }
      }
      // Optionally fetch balance before starting (UI could warn).
      try {
        const wallet = (account?.address || "").toLowerCase();
        if (wallet) {
          fetch(`/api/billing/balance`, { headers: { "x-wallet": wallet } }).catch(() => { });
          // Log system prompt to start new conversation context
          if (systemPrompt && systemPrompt.trim()) {
            const instructions = buildInstructions(
              systemPrompt,
              language,
              otherLanguage,
            );
            fetch("/api/conversations/log", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-wallet": wallet },
              body: JSON.stringify({
                wallet,
                role: "user",
                text: `[[system]] ${instructions}`,
                embed: true,
              }),
            }).catch(() => { });
          }
        }
      } catch { }
      await initWebRTC(key); // resolves after prompt applied on dataChannel open
      // Start client-side usage/billing and log heartbeat
      try {
        const w = (account?.address || "").toLowerCase();
        if (w) {
          // register happens in navbar on connect
          // Log session start
          fetch("/api/sessions/log", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": w },
            body: JSON.stringify({
              wallet: w,
              sessionId,
              type: "session_start",
              data: {
                voice,
                vadThreshold,
                vadPrefixMs,
                vadSilenceMs,
                maxResponse,
                temperature,
              },
            }),
          }).catch(() => { });
        }
      } catch { }
      setIsListening(true);
      try { if (isSilenced) stopSilence(); } catch { }
      setToolStatus("Listening started");
    } catch (e: any) {
      console.error(e);
      setMicCaptureActive(false);
      micCaptureActiveRef.current = false;
      try {
        const ms = inputStreamRef.current;
        if (ms) ms.getTracks().forEach((t) => t.stop());
      } catch { }
    }
  }, [voice, initWebRTC, account?.address, useMicInput]);
  const stopSession = useCallback(() => {
    setMicCaptureActive(false);
    micCaptureActiveRef.current = false;
    try { if (isSilenced) stopSilence(); } catch { }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch { }
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch { }
      peerConnectionRef.current = null;
    }
    if (audioRef.current) audioRef.current.srcObject = null;
    if (inputStreamRef.current) {
      try {
        inputStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch { }
      inputStreamRef.current = null;
    }
    cleanupAnalyser();
    setMicVolume(0);
    setAgentVolume(0);
    setIsListening(false);
    setSpeakingText("");
    if (billingIntervalRef.current) {
      clearInterval(billingIntervalRef.current);
      billingIntervalRef.current = null;
    }
    setDcState("closed");
    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = null;
    }
    // Immediately mark presence offline so Live Now removes the card right away
    try {
      const wallet = (account?.address || "").toLowerCase();
      if (wallet) {
        fetch("/api/users/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": wallet },
          body: JSON.stringify({ live: false, sessionId }),
        }).catch(() => { });
      }
    } catch { }
    try {
      if (unloadHandlerRef.current)
        window.removeEventListener("beforeunload", unloadHandlerRef.current);
    } catch { }
    // Flush any remaining seconds to server on stop
    try {
      const wallet = (account?.address || "").toLowerCase();
      const secs = sessionSeconds % 10;
      if (secs > 0) {
        fetch("/api/billing/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": wallet },
          body: JSON.stringify({
            seconds: secs,
            idempotencyKey: `${wallet}-flush-${Date.now()}`,
            wallet,
          }),
        }).catch(() => { });
      }
      // Log session_end summary for XP bonuses
      try {
        const langs = [
          language === "Other" ? otherLanguage || "English" : language,
        ];
        fetch("/api/sessions/log", {
          method: "POST",
                              headers: { "Content-Type": "application/json", "x-wallet": (() => { try { const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : ""; return ((account?.address || "") || fallback).toLowerCase(); } catch { return (account?.address || "").toLowerCase(); } })() },
          body: JSON.stringify({
            wallet,
            sessionId,
            type: "session_end",
            data: {
              seconds: sessionSeconds,
              languages: langs,
              languageCount: langs.length,
              rollsCount:
                rollTheme ||
                  rollArchetype ||
                  rollTone ||
                  rollStyle ||
                  rollDomain ||
                  rollFormatting ||
                  rollLength
                  ? 1
                  : 0,
              guestsCount: guestList.length,
              platform,
              agentRole,
              domain: sessionDomain && sessionDomain !== "auto" ? sessionDomain : undefined,
              topics: rollTopics,
            },
          }),
        }).catch(() => { });
      } catch { }
    } catch { }
    setToolStatus("Listening stopped");
  }, [cleanupAnalyser]);

  // Pull latest System Prompt from CRM when wallet connects; light polling when not listening
  useEffect(() => {
    const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
    const w = ((account?.address || "") || fallback).toLowerCase();
    if (!w) return;
    let cancelled = false;
    const fetchPrompt = async () => {
      try {
        const r = await fetch("/api/crm/prompt/pull", {
          headers: { "x-wallet": w },
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        const p = j?.stored?.prompt || j?.prompt || "";
        if (r.ok && typeof p === "string" && p.trim()) {
          setSystemPrompt(p);
          latestPromptRef.current = p;
          setToolStatus("Pulled System Prompt from CRM");
        }
      } catch { }
    };
    fetchPrompt();
    if (!isListening) {
      try {
        promptRefreshIntervalRef.current = window.setInterval(fetchPrompt, 15000) as unknown as number;
      } catch { }
    }
    return () => {
      cancelled = true;
      if (promptRefreshIntervalRef.current) {
        try { clearInterval(promptRefreshIntervalRef.current); } catch { }
        promptRefreshIntervalRef.current = null;
      }
    };
  }, [account?.address, isListening]);

  function startSilence(seconds: number) {
    const dur = Math.max(1, Math.floor(seconds || 0));
    // Reset any existing timer and cancel any in-flight responses
    try {
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      dataChannelRef.current?.send(JSON.stringify({ type: "response.cancel" }));
    } catch { }
    setIsSilenced(true);
    setSilenceSeconds(dur);
    try {
      if (agentOutRef.current) {
        agentOutRef.current.muted = true;
        agentOutRef.current.volume = 0;
      }
    } catch { }
    try {
      const ms = inputStreamRef.current;
      if (ms) ms.getTracks().forEach((t) => t.stop());
      micCaptureActiveRef.current = false;
      setMicCaptureActive(false);
    } catch { }
    try {
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
    } catch { }
    silenceIntervalRef.current = window.setInterval(() => {
      setSilenceSeconds((s) => {
        const next = s - 1;
        if (next <= 0) {
          stopSilence();
          return 0;
        }
        return next;
      });
    }, 1000) as unknown as number;
    try {
      setToolStatus(`Silenced for ${dur}s`);
    } catch { }
  }

  function stopSilence() {
    try {
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
    } catch { }
    setIsSilenced(false);
    setSilenceSeconds(0);
    try {
      if (agentOutRef.current) {
        agentOutRef.current.muted = false;
        agentOutRef.current.volume = 1;
      }
    } catch { }
    try {
      micCaptureActiveRef.current = true;
      setMicCaptureActive(true);
      if (useMicInput) ensureMicRef.current();
      try { ensureMicSender(peerConnectionRef.current); } catch { }
    } catch { }
    try {
      setToolStatus("Silence ended");
    } catch { }
  }

  function handleTriviaStart(players: string[]) {
    const safePlayers = Array.isArray(players)
      ? players
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean)
      : [];
    if (!safePlayers.length) return;
    const scores: Record<string, number> = {};
    for (const p of safePlayers) scores[p] = 0;
    triviaRef.current = {
      players: safePlayers,
      scores,
      round: 0,
      index: 0,
      started: true,
    };
    try {
      setToolStatus(`Trivia started: ${safePlayers.join(", ")}`);
    } catch { }
    askNextTriviaQuestion();
  }

  function askNextTriviaQuestion() {
    const t = triviaRef.current;
    if (!t.started) return;
    if (t.round >= 5) {
      const sorted = t.players
        .slice()
        .sort((a, b) => (t.scores[b] - t.scores[a]));
      const winner = sorted[0] || "";
      const runner = sorted[1] || "";
      sendUserMessage(
        `Trivia complete! Winner: ${winner} with ${t.scores[winner] || 0} points. Runner-up: ${runner} with ${t.scores[runner] || 0} points.`,
      );
      t.started = false;
      return;
    }
    const player = t.players[t.index];
    // Use developer instruction to be precise; send a user nudge as a fallback
    sendDeveloper(
      `Ask a unique trivia question to ${player}. Wait for their answer. If correct, call the tool 'trivia_answer' with {"player":"${player}","correct":true}. If wrong, call it with {"player":"${player}","correct":false}. Do not proceed to the next question until after the tool call.`
    );
    sendUserMessage(
      `Ask a unique trivia question to ${player}. Wait for their answer, then call the 'trivia_answer' tool with the result.`
    );
    // Play waiting music using the Media Player's current source if available
    try {
      const a = mediaAudioRef.current;
      if (a) {
        if (!a.src) {
          setToolStatus("Load a track in Media Player for trivia waiting music");
        }
        a.loop = true;
        a.volume = 0.7;
        a.play().catch(() => { });
      }
    } catch { }
  }

  function handleTriviaAnswer(player: string, correct: boolean) {
    const t = triviaRef.current;
    if (!t.started) return;
    if (!(player in t.scores)) t.scores[player] = 0;
    if (correct) t.scores[player] += 100;
    // stop waiting music
    try {
      const a = mediaAudioRef.current;
      if (a) {
        a.pause();
        a.loop = false;
      }
    } catch { }
    // advance index/round
    t.index += 1;
    if (t.index >= t.players.length) {
      t.index = 0;
      t.round += 1;
    }
    askNextTriviaQuestion();
  }
  // Track total used today
  useEffect(() => {
    setUsedToday(getUsedSecondsToday());
    const i = window.setInterval(
      () => setUsedToday(getUsedSecondsToday()),
      2000,
    );
    return () => clearInterval(i);
  }, []);
  function beginBillingTimer() {
    if (billingIntervalRef.current) return;
    setSessionSeconds(0);
    let batched = 0;
    billingIntervalRef.current = window.setInterval(async () => {
      setSessionSeconds((s) => s + 1);
      addUsageSeconds(1);
      batched += 1;
      // Persist usage to server in small batches (every 10s)
      if (batched >= 10) {
        const wallet = (account?.address || "").toLowerCase();
        try {
          await fetch("/api/billing/usage", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": wallet },
            body: JSON.stringify({
              seconds: batched,
              idempotencyKey: `${wallet}-${Date.now()}-${batched}`,
              wallet,
            }),
          });
        } catch { }
        batched = 0;
      }
      try {
        const w = (account?.address || "").toLowerCase();
        if (w && !isOwner) {
          const r = await fetch("/api/billing/balance", {
            headers: { "x-wallet": w },
          });
          const j = await r.json().catch(() => ({}));
          const left = Number(j?.balanceSeconds || 0);
          if (left <= 10 && left >= 0) {
            setToolStatus(`Time remaining: ${left}s`);
          }
          if (left <= 0) {
            stopSession();
          }
        }
      } catch { }
    }, 1000) as unknown as number;
    // Ensure usage is flushed if the tab/window is closed
    unloadHandlerRef.current = () => {
      try {
        const wallet = (account?.address || "").toLowerCase();
        const secs = sessionSeconds + batched;
        if (secs > 0)
          navigator.sendBeacon(
            "/api/billing/usage",
            new Blob(
              [
                JSON.stringify({
                  seconds: secs,
                  idempotencyKey: `${wallet}-unload-${Date.now()}`,
                  wallet,
                }),
              ],
              { type: "application/json" },
            ),
          );
      } catch { }
    };
    try {
      window.addEventListener("beforeunload", unloadHandlerRef.current);
    } catch { }
  }
  async function sendPresenceNow() {
    const wallet = (account?.address || "").toLowerCase();
    if (!wallet) return;
    try {
      const payload: any = {
        live: true,
        sessionId,
        spaceUrl: (spaceUrl || "").trim() || undefined,
        spacePublic,
        spaceImage: spaceImage || undefined,
      };
      const langNow =
        language === "Other" ? otherLanguage || "English" : language;
      if (langNow) payload.language = langNow;
      // Prefer explicit sessionDomain if set; otherwise use locked rollDomain
      if (
        (sessionDomain && sessionDomain !== "auto") ||
        domainLocked ||
        (rollDomain && rollDomain !== "auto")
      )
        payload.domain =
          sessionDomain && sessionDomain !== "auto"
            ? sessionDomain
            : domainLocked || rollDomain;
      if (platform && platform !== "auto") payload.platform = platform;
      await fetch("/api/users/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": wallet },
        body: JSON.stringify(payload),
      });
    } catch { }
  }
  function beginPresenceHeartbeat() {
    if (presenceIntervalRef.current) return;
    const wallet = (account?.address || "").toLowerCase();
    if (!wallet) return;
    sendPresenceNow();
    presenceIntervalRef.current = window.setInterval(
      sendPresenceNow,
      30_000,
    ) as unknown as number;
  }
  /**
   * Helper: simple sleep
   */
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Ensure RTCPeerConnection has a live audio sender; if missing or dead, reacquire mic and add track
  async function ensureMicSender(pc: RTCPeerConnection | null): Promise<void> {
    try {
      if (!pc) return;
      const hasLiveAudio = pc.getSenders && pc.getSenders().some((s) => {
        try { return !!s && s.track && s.track.kind === "audio" && s.track.readyState === "live"; } catch { return false; }
      });
      if (hasLiveAudio) return;

      const micConstraints: any = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      };
      if (selectedInputId) micConstraints.deviceId = { exact: selectedInputId };

      let stream: MediaStream | null = inputStreamRef.current;
      const needsNewStream =
        !stream ||
        stream.getAudioTracks().length === 0 ||
        stream.getAudioTracks().some((t) => t.readyState !== "live");

      if (needsNewStream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
        inputStreamRef.current = stream;
      }
      const track = stream ? stream.getAudioTracks()[0] : undefined;
      if (track && stream) {
        // Prefer replacing an existing sender's track if present, otherwise add a new sender
        const audioSenders = (pc.getSenders ? pc.getSenders() : []).filter((s) => {
          try { return !!s && s.track && s.track.kind === "audio"; } catch { return false; }
        });
        const existing = audioSenders[0];
        if (existing) {
          try {
            const ready = existing.track && existing.track.readyState === "live";
            if (!ready) {
              await existing.replaceTrack(track);
            } else {
              // Already live; no action needed
            }
          } catch {
            // Fallback: add a new track if replaceTrack fails
            try { pc.addTrack(track, stream); } catch { }
          }
        } else {
          try { pc.addTrack(track, stream); } catch { }
        }
      }
    } catch { }
  }

  // Store last availability window to use as fallback for schedule_meeting if the model omits times
  const lastAvailabilityRef = useRef<{ startISO: string; endISO: string; timeZone: string } | null>(null);

  // Send tool output back to the model to acknowledge tool execution and provide results (supports multiple runtimes)
  function sendToolOutput(name: string, payload: any) {
    try {
      dataChannelRef.current?.send(
        JSON.stringify({
          type: "response.function_call.output",
          name,
          output: JSON.stringify(payload),
        }),
      );
    } catch { }
    try {
      dataChannelRef.current?.send(
        JSON.stringify({
          type: "response.tool_output",
          tool: {
            name,
            output: JSON.stringify(payload),
          },
        }),
      );
    } catch { }
    try {
      dataChannelRef.current?.send(JSON.stringify({ type: "response.create" }));
    } catch { }
  }

  /**
   * Helper: wait for WebRTC to be ready
   * Conditions:
   *  - dataChannel open
   *  - RTCPeerConnection is present and not failed
   *  - Accepts slight delay for agent audio track arrival; dcOpen + stable signaling is sufficient
   */
  async function waitForWebRTCReady(timeoutMs = 12000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const pc = peerConnectionRef.current;
        const dc = dataChannelRef.current;
        const audioObj = audioRef.current?.srcObject as MediaStream | null;
        const dcOpen = !!dc && dc.readyState === "open";
        const pcActive = !!pc && pc.signalingState === "stable" && pc.connectionState !== "failed";
        const iceConnected = !!pc && (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed");
        const micLive = !!pc && pc.getSenders && pc.getSenders().some((s) => {
          try { return !!s && s.track && s.track.readyState === "live"; } catch { return false; }
        });
        const agentHasAudio =
          !!audioObj && audioObj.getAudioTracks && audioObj.getAudioTracks().length > 0;

        if (dcOpen && pcActive && iceConnected && micLive) {
          return true;
        }
      } catch { }
      await sleep(200);
    }
    return false;
  }

  async function confirmAndStart(correlationId?: string) {
    setShowConfirm(false);
    if (isStarting || isListening) return;
    setIsStarting(true);

    // Ensure AudioContext is resumed on user gesture before capturing mic or starting WebRTC
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      await ctx.resume();
    } catch { }

    let started = false;
    for (let attempt = 1; attempt <= 3 && !started; attempt++) {
      try {
        try {
          setToolStatus(
            `Starting session (attempt ${attempt}${correlationId ? `, corr ${correlationId}` : ""})`
          );
        } catch { }

        await startSession(); // ensures prompt is applied

        // Wait for WebRTC readiness (data channel open + stable signaling)
        const ready = await waitForWebRTCReady(12000);
        if (ready) {
          started = true;
          if (rollDomain && rollDomain !== "auto") setDomainLocked(rollDomain);
          beginBillingTimer();
          beginPresenceHeartbeat();
          try {
            setToolStatus("Listening started");
          } catch { }
          break;
        }

        // Not ready: stop and backoff before retry
        try {
          setToolStatus("WebRTC not ready; retrying…");
        } catch { }
        try {
          stopSession();
        } catch { }
        await sleep(500 * attempt);
      } catch (e: any) {
        // Ephemeral key or SDP failure; backoff and retry
        try {
          setToolStatus(`Start error: ${e?.message || "failed"} — retrying…`);
        } catch { }
        try {
          stopSession();
        } catch { }
        await sleep(500 * attempt);
      }
    }

    setIsStarting(false);
    if (!started) {
      try {
        setToolStatus(
          `Start failed after 3 attempts${correlationId ? ` (corr ${correlationId})` : ""}`
        );
      } catch { }
    }
  }
  /**
   * CRM control polling: VoiceHub Console listens for CRM commands pushed into
   * /api/crm/control queue and executes them:
   *  - apply: update prompt and settings, then send session.update
   *  - start: begin the listening session (ephemeral key flow)
   *  - stop: end the listening session
   */
  useEffect(() => {
    const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
    const wallet = ((account?.address || "") || fallback).toLowerCase();
    if (!wallet) return;
    let cancelled = false;

    const applySettingsFromPayload = (payload: any) => {
      try {
        if (!payload) return;
        // Prompt
        if (typeof payload.prompt === "string" && payload.prompt.trim()) {
          setSystemPrompt(payload.prompt);
          latestPromptRef.current = payload.prompt;
        }
        // Settings (optional)
        const s = payload.settings || {};
        if (typeof s.voice === "string") setVoice(s.voice as any);
        if (typeof s.vadThreshold === "number") setVadThreshold(s.vadThreshold);
        if (typeof s.vadPrefixMs === "number") setVadPrefixMs(Math.round(s.vadPrefixMs));
        if (typeof s.vadSilenceMs === "number") setVadSilenceMs(Math.round(s.vadSilenceMs));
        if (typeof s.maxResponse === "number") setMaxResponse(Math.min(2000, Math.max(128, s.maxResponse)));
        if (typeof s.temperature === "number") setTemperature(s.temperature);
        if (typeof s.language === "string") setLanguage(s.language);
        if (typeof s.otherLanguage === "string") setOtherLanguage(s.otherLanguage);
        if (typeof s.platform === "string") setPlatform(s.platform);
        if (typeof s.agentRole === "string") setAgentRole(s.agentRole);
        if (typeof s.hostName === "string") setHostName(s.hostName);
        try {
          setDirty((d) => ({
            ...(d || {}),
            prompt: !!payload.prompt,
            params: true,
            language: typeof s.language === "string" ? true : (d?.language || false),
            platform: typeof s.platform === "string" ? true : (d?.platform || false),
            role: typeof s.agentRole === "string" ? true : (d?.role || false),
          }));
        } catch { }
        // If connected, apply immediately
        const ch = dataChannelRef.current;
        if (ch && ch.readyState === "open") {
          sendInstructions("Prompt (CRM apply)");
          try { setToolStatus("CRM: Apply Settings dispatched"); } catch { }
        } else {
          try { setToolStatus("CRM: Apply queued (will apply on start)"); } catch { }
        }
      } catch { }
    };

    const pollOnce = async () => {
      try {
        const r = await fetch("/api/crm/control", {
          headers: { "x-wallet": wallet },
          cache: "no-store",
        });
        const j: any = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (j?.ok && j.event) {
          const ev = j.event as { command: string; payload?: any; correlationId?: string };
          const cmd = String(ev.command || "").toLowerCase();
          if (cmd === "apply") {
            applySettingsFromPayload(ev.payload);
          } else if (cmd === "start") {
            if (!isListening && !isStarting) {
              try { setToolStatus("CRM: Start Listening"); } catch { }
              await confirmAndStart(ev.correlationId || undefined);
            }
          } else if (cmd === "stop") {
            if (isListening) {
              try { setToolStatus("CRM: Stop Listening"); } catch { }
              stopSession();
            }
          }
        }
      } catch { }
    };

    const id = typeof window !== "undefined" ? (window.setInterval(pollOnce, 2000) as unknown as number) : null;
    // Prime immediately
    pollOnce();

    return () => {
      cancelled = true;
      if (id) {
        try { clearInterval(id); } catch { }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, isListening, isStarting]);

  const consoleSections = [
    { id: "session-basics", label: "Session" },
    { id: "audience-language", label: "Audience" },
    { id: "platform-role", label: "Platform & Guests" },
    { id: "prompt-behavior", label: "Prompt & Behavior" },
    { id: "connect-crm", label: "Connect CRM" },
    { id: "public-space", label: "Live Now" },
    { id: "media-player", label: "Media Player" },
    { id: "audio-setup", label: "Audio Setup" },
  ];
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Console</h1>
        <nav className="mb-6">
          <div className="glass-pane rounded-xl border p-3 flex flex-wrap gap-2 text-xs sm:text-sm">
            {consoleSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="px-3 py-1.5 rounded-md border border-foreground/10 hover:bg-foreground/5 transition"
              >
                {section.label}
              </a>
            ))}
          </div>
        </nav>
        {/* Wallet not connected warning */}
        {!account?.address && (
          <div className="glass-pane rounded-xl border p-4 mb-6 bg-yellow-500/10 border-yellow-500/50">
            <div className="text-sm">
              <span className="font-semibold">Wallet not connected.</span>{" "}
              Connect your wallet to start sessions, save your profile, &&
              purchase minutes.
            </div>
          </div>
        )}
        {isMobile ? (
          <div className="glass-pane rounded-xl border p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Mobile Not Supported</h2>
            <p className="text-muted-foreground">
              Open this page on a desktop || laptop to use live audio features.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main: Agent Controls and Visualization */}
            <div className="glass-pane rounded-xl border p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Agent Controls</h2>
                <div className="microtext text-muted-foreground">
                  {isSilenced ? (
                    <button
                      type="button"
                      className="px-2 py-1 rounded border"
                      title={`Stop silence (${Math.floor(silenceSeconds / 60)}:${String(silenceSeconds % 60).padStart(2, "0")} left)`}
                      onClick={stopSilence}
                    >
                      Silenced {Math.floor(silenceSeconds / 60)}:{String(silenceSeconds % 60).padStart(2, "0")} — Stop
                    </button>
                  ) : ""}
                </div>
              </div>
              <div className="space-y-5">
                <div id="session-basics" className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        Session Basics
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Load presets, watch levels, && control the live agent.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Presets</div>
                      <span className="microtext text-muted-foreground">
                        {selectedPreset
                          ? `Active: ${selectedPreset.name}`
                          : "No preset selected"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative" ref={presetMenuRef}>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border bg-background min-w-[180px] flex items-center justify-between gap-2"
                          onClick={() => setPresetMenuOpen((v) => !v)}
                        >
                          <span className="truncate">
                            {selectedPreset
                              ? selectedPreset.name
                              : "Select preset"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            &#9662;
                          </span>
                        </button>
                        {presetMenuOpen && (
                          <div className="absolute z-40 mt-2 w-64 max-h-64 overflow-auto glass-float rounded-xl border bg-background p-2 space-y-1">
                            {sortedPresets.length ? (
                              sortedPresets.map((p) => {
                                const updatedLabel = new Date(
                                  p.updatedAt || p.createdAt || Date.now(),
                                ).toLocaleString();
                                return (
                                  <div
                                    key={p.id}
                                    className={`flex items-center gap-2 rounded-md border px-2 py-2 ${selectedPresetId === p.id ? "bg-foreground/10 border-foreground/20" : "border-transparent hover:bg-foreground/5"}`}
                                  >
                                    <button
                                      type="button"
                                      className="flex-1 text-left"
                                      onClick={() => handleSelectPreset(p)}
                                    >
                                      <div className="text-sm font-medium">
                                        {p.name}
                                      </div>
                                      <div className="microtext text-muted-foreground">
                                        Updated {updatedLabel}
                                      </div>
                                    </button>
                                    {selectedPresetId !== p.id && (
                                      <button
                                        type="button"
                                        className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded border border-transparent"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeletePreset(p.id);
                                        }}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="px-2 py-2 text-xs text-muted-foreground">
                                No presets yet. Use Add New to save this
                                configuration.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border"
                          onClick={handleAddPreset}
                        >
                          Add New
                        </button>
                        {presetDialogOpen && (
                          <div
                            ref={presetDialogRef}
                            className="absolute z-50 mt-2 w-72 max-w-[80vw] glass-float rounded-xl border bg-background p-3 space-y-3"
                          >
                            <div>
                              <label className="text-xs font-medium">
                                Preset name
                              </label>
                              <input
                                ref={presetNameInputRef}
                                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                                value={presetDraftName}
                                onChange={(e) => {
                                  setPresetDraftName(e.target.value);
                                  setPresetDialogError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleConfirmAddPreset();
                                  }
                                }}
                                placeholder="e.g., Morning stream"
                              />
                            </div>
                            {presetDialogError && (
                              <div className="microtext text-red-500">
                                {presetDialogError}
                              </div>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-md border"
                                onClick={handleCancelPresetDialog}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]"
                                onClick={handleConfirmAddPreset}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={handleSavePreset}
                        disabled={!selectedPresetId}
                      >
                        Save/Update
                      </button>
                    </div>
                  </div>
                  {/* Currency switcher (top-right of container) */}
                  <div className="absolute top-4 right-4 z-40">
                    <div className="relative">
                      <button
                        className="h-10 pl-10 pr-3 rounded-md border bg-background flex items-center gap-2 text-sm"
                        onClick={() => setShowCurrencyMenu((v) => !v)}
                        title="Currency"
                      >
                        {currency === "ETH" ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-foreground/10 text-[11px] font-semibold">
                              {"\u039E"}
                            </span>
                            <span className="font-medium">ETH</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="flag-ring absolute left-2 top-1/2 -translate-y-1/2"
                              style={{ width: 18, height: 18 }}
                            >
                              <img alt={currency} src={flagUrl(currency)} />
                            </span>
                            <span className="font-medium">{currency}</span>
                          </span>
                        )}
                        <span className="ml-1 opacity-70">{"\u25BE"}</span>
                      </button>
                      {showCurrencyMenu && (
                        <div className="absolute right-0 mt-2 md:w-56 w-[80vw] max-w-[80vw] rounded-md border bg-background shadow-md p-1 text-sm space-y-1 z-40">
                          <button
                            className="w-full text-left px-2 py-2 rounded hover:bg-foreground/5 flex items-center gap-2"
                            onClick={() => {
                              setCurrency("ETH");
                              setShowCurrencyMenu(false);
                            }}
                          >
                            <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-foreground/10 text-[11px] font-semibold">
                              {"\u039E"}
                            </span>
                            <span className="font-medium">ETH</span>
                            <span className="ml-auto microtext text-muted-foreground">
                              base
                            </span>
                          </button>
                          {CURRENCIES.map((c) => (
                            <button
                              key={c.code}
                              className="w-full text-left px-2 py-2 rounded hover:bg-foreground/5 flex items:center gap-2"
                              onClick={() => {
                                setCurrency(c.code);
                                setShowCurrencyMenu(false);
                              }}
                            >
                              <span
                                className="flag-ring"
                                style={{ width: 18, height: 18 }}
                              >
                                <img alt={c.code} src={flagUrl(c.code)} />
                              </span>
                              <span className="font-medium">{c.code}</span>
                              <span className="text-muted-foreground">
                                - {c.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Visualization */}
                  <div className="flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-8">
                      <OrbMeter value={micVolume} label="You" />
                      <OrbMeter value={agentVolume} label="Agent" color="#29B6F5" />
                    </div>
                  </div>
                  <div className="text:center microtext text-muted-foreground">
                    Session: {isListening ? "Listening" : "Idle"} {"\u2022"} Balance:{" "}
                    {balance
                      ? `${Math.floor((balance.balanceSeconds || 0) / 60)}m ${(balance.balanceSeconds || 0) % 60}s`
                      : "checking..."}
                    {balance?.degraded ? " (degraded)" : ""}  {"\u2022"}  Cost (live):{" "}
                    {(() => {
                      const eth = sessionEth(sessionSeconds);
                      const r = rates[currency] || 1;
                      return currency === "ETH"
                        ? `${eth.toFixed(6)} ETH`
                        : `${(eth * r).toFixed(2)} ${currency}`;
                    })()}{" "}
                    (
                    {(() => {
                      const ethHr = ethPer2Min * 30;
                      const r = rates[currency] || 1;
                      return currency === "ETH"
                        ? `${ethHr.toFixed(6)} ETH/hr`
                        : `${(ethHr * r).toFixed(2)} ${currency}/hr`;
                    })()}
                    )
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Input device (mic to agent)
                    </label>
                    <select
                      className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                      value={selectedInputId}
                      onChange={(e) => setSelectedInputId(e.target.value)}
                    >
                      <option value="">System default</option>
                      {inputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || d.deviceId}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Grant mic permission if prompted; pick your real
                      microphone here if needed.
                    </p>
                  </div>
                  {/* Output selection removed; rely on system default (VB-CABLE if selected at OS level) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voice</label>
                    <select
                      className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                      value={voice}
                      onChange={(e) => {
                        const v = e.target.value as VoiceName;
                        setVoice(v);
                        try {
                          const w = (account?.address || "").toLowerCase();
                          if (w)
                            fetch("/api/sessions/log", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                wallet: w,
                                sessionId,
                                type: "param_change",
                                data: { key: "voice", value: v },
                              }),
                            }).catch(() => { });
                        } catch { }
                      }}
                      disabled={isListening}
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div
                  id="audience-language"
                  className="space-y-6 border-t border-foreground/10 pt-6"
                >
                  <div className="flex items:start justify:between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        Audience & Language
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Fine-tune languages && regions for your listeners.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <div className="w-full">
                      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <select
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={(() => {
                              const g = getGroupForLanguage(language);
                              if (
                                g &&
                                g !== "OTHER/UNCLASSIFIED" &&
                                g !== "CONSTRUCTED & FICTIONAL LANGUAGES"
                              )
                                return g;
                              return "";
                            })()}
                            onChange={(e) => {
                              const g = e.target.value;
                              // When category changes, pick the first language in that category
                              const list = getLanguagesForRegion(g) || [];
                              const pick = list[0] || language;
                              setLanguage(pick);
                            }}
                          >
                            <option value="">Select a category...</option>
                            {GROUPS.filter(
                              (g) =>
                                g !== "OTHER/UNCLASSIFIED" &&
                                g !== "CONSTRUCTED & FICTIONAL LANGUAGES",
                            ).map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <select
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={language}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLanguage(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w) {
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "language", value: v },
                                    }),
                                  }).catch(() => { });
                                  if (isListening)
                                    fetch("/api/users/presence", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        "x-wallet": w,
                                      },
                                      body: JSON.stringify({
                                        live: true,
                                        sessionId,
                                        language:
                                          v === "Other"
                                            ? otherLanguage || "English"
                                            : v,
                                      }),
                                    }).catch(() => { });
                                }
                              } catch { }
                            }}
                          >
                            {(() => {
                              const rawLanguages = [
                                // AFRICA - West
                                "AFRICA - West",
                                "Akan",
                                "Bambara",
                                "Berom",
                                "Efik",
                                "Esan",
                                "Fula",
                                "Fulah (Fulfulde)",
                                "Hausa",
                                "Idoma",
                                "Igbo",
                                "Itsekiri",
                                "Ijaw",
                                "Nupe",
                                "Pidgin English (Nigerian Pidgin)",
                                "Urhobo",
                                "Yoruba",
                                // AFRICA - East
                                "AFRICA - East",
                                "Amharic",
                                "Chichewa",
                                "Ganda",
                                "Kikuyu",
                                "Kinyarwanda",
                                "Maasai",
                                "Somali",
                                "Swahili",
                                "Tigrinya",
                                // AFRICA - Central & Southern
                                "AFRICA - Central & Southern",
                                "Bemba",
                                "Herero",
                                "Kanembu",
                                "Kanuri",
                                "Kongo",
                                "Kpelle",
                                "Kuanyama",
                                "Ndonga",
                                "Rundi",
                                "Sandawe",
                                "Sango",
                                "Sesotho",
                                "Setswana",
                                "Shona",
                                "Swati",
                                "Tsonga",
                                "Tswana",
                                "Tumbuka",
                                "Venda",
                                "Wolaytta",
                                "Wolof",
                                "Xhosa",
                                "Zulu",
                                // AFRICA - North
                                "AFRICA - North",
                                "Arabic (Algeria)",
                                "Arabic (Egypt)",
                                "Arabic (Morocco)",
                                "Arabic (Sudan)",
                                "Berber (Tamazight)",
                                // ASIA - South
                                "ASIA - South",
                                "Assamese",
                                "Bengali",
                                "Bhojpuri",
                                "Dogri",
                                "Gujarati",
                                "Haryanvi",
                                "Hindi",
                                "Kannada",
                                "Kashmiri",
                                "Konkani",
                                "Maithili",
                                "Malayalam",
                                "Manipuri (Meitei)",
                                "Marathi",
                                "Nagpuri",
                                "Nepali",
                                "Nepali (Indian)",
                                "Odia",
                                "Punjabi (Gurmukhi)",
                                "Punjabi (Shahmukhi)",
                                "Rajasthani",
                                "Sanskrit",
                                "Santali",
                                "Sindhi",
                                "Sinhala",
                                "Tamil",
                                "Telugu",
                                "Tulu",
                                "Urdu",
                                "Urdu (Indian)",
                                // ASIA - Southeast
                                "ASIA - Southeast",
                                "Acehnese",
                                "Balinese",
                                "Bislama",
                                "Cebuano",
                                "Filipino",
                                "Hiligaynon",
                                "Ilocano",
                                "Indonesian",
                                "Javanese",
                                "Minangkabau",
                                "Mizo",
                                "Pampangan",
                                "Pangasinan",
                                "Sasak",
                                "Sundanese",
                                "Tagalog",
                                "Tetum",
                                "Thai",
                                "Vietnamese",
                                "Waray",
                                // ASIA - East
                                "ASIA - East",
                                "Ainu",
                                "Cantonese (Chinese)",
                                "Chinese (Cantonese)",
                                "Chinese (Gan)",
                                "Chinese (Hakka)",
                                "Chinese (Hokkien)",
                                "Chinese (Jin)",
                                "Chinese (Mandarin)",
                                "Chinese (Min)",
                                "Chinese (Wu)",
                                "Chinese (Xiang)",
                                "Japanese",
                                "Korean",
                                "Mongolian",
                                // ASIA - Central & North
                                "ASIA - Central & North",
                                "Avar",
                                "Avestan",
                                "Azerbaijani (North)",
                                "Azerbaijani (South)",
                                "Chechen",
                                "Chuvash",
                                "Dari",
                                "Ingush",
                                "Kalmyk",
                                "Karakalpak",
                                "Karachay-Balkar",
                                "Kazakh",
                                "Kirghiz",
                                "Komi",
                                "Kumyk",
                                "Kurdish (Kurmanji)",
                                "Kurdish (Sorani)",
                                "Kurdish (Zazaki)",
                                "Kyrgyz",
                                "Lao",
                                "Pashto",
                                "Tajik",
                                "Tatar",
                                "Turkish",
                                "Turkmen",
                                "Uighur",
                                "Uzbek",
                                // MIDDLE EAST & WESTERN ASIA
                                "MIDDLE EAST & WESTERN ASIA",
                                "Arabic (Gulf)",
                                "Arabic (Iraq)",
                                "Arabic (Levant)",
                                "Arabic (MSA)",
                                "Aramaic",
                                "Armenian (Eastern)",
                                "Armenian (Western)",
                                "Hebrew",
                                "Ossetian",
                                "Persian (Farsi)",
                                "Syriac",
                                "Phoenician",
                                "Old Persian",
                                // EUROPE - Western & Northern
                                "EUROPE - Western & Northern",
                                "Breton",
                                "Catalan",
                                "Cornish",
                                "Danish",
                                "Dutch",
                                "English",
                                "English (Australian)",
                                "English (British)",
                                "English (Canadian)",
                                "English (Indian)",
                                "English (Nigerian)",
                                "English (US)",
                                "Faroese",
                                "Flemish",
                                "French",
                                "French (Belgian)",
                                "French (Canadian)",
                                "French (Swiss)",
                                "Frisian",
                                "Friulian",
                                "Galician",
                                "German",
                                "German (Austrian)",
                                "German (Swiss)",
                                "Icelandic",
                                "Irish",
                                "Italian",
                                "Ladino",
                                "Latin",
                                "Limburgish",
                                "Lombard",
                                "Low German",
                                "Luxembourgish",
                                "Manx",
                                "Neapolitan",
                                "Norwegian",
                                "Norwegian (Bokmal)",
                                "Norwegian (Nynorsk)",
                                "Occitan",
                                "Picard",
                                "Plautdietsch",
                                "Portuguese (Brazil)",
                                "Portuguese (Portugal)",
                                "Romansh",
                                "Scots",
                                "Scottish Gaelic",
                                "Sicilian",
                                "Spanish",
                                "Swedish",
                                "Swiss German",
                                "Venetian",
                                "Walloon",
                                "Welsh",
                                "Western Frisian",
                                // EUROPE - Eastern & Central
                                "EUROPE - Eastern & Central",
                                "Albanian",
                                "Asturian",
                                "Belarusian",
                                "Bosnian",
                                "Bulgarian",
                                "Byelorussian",
                                "Croatian",
                                "Czech",
                                "Estonian",
                                "Georgian",
                                "Greek",
                                "Hungarian",
                                "Latgalian",
                                "Latvian",
                                "Lithuanian",
                                "Macedonian",
                                "Montenegrin",
                                "Polish",
                                "Romanian",
                                "Rusyn",
                                "Russian",
                                "Serbian",
                                "Serbo-Croatian",
                                "Slovak",
                                "Slovenian",
                                "Udmurt",
                                "Ukrainian",
                                "Upper Sorbian",
                                "Voro",
                                "Votic",
                                "Zaza",
                                // EUROPE - Minority & Other
                                "EUROPE - Minority & Other",
                                "Aragonese",
                                "Braj",
                                "Crimean Tatar",
                                "Greenlandic (Kalaallisut)",
                                "Kalaallisut (Greenlandic)",
                                "Kashubian",
                                "Mirandese",
                                "Osage",
                                "Quenya (Elvish)",
                                "Rhaeto-Romance",
                                "Romany",
                                "Sardinian",
                                "Solresol",
                                "Votic",
                                // AMERICAS - North
                                "AMERICAS - North",
                                "Chilcotin",
                                "Chipewyan",
                                "Inuktitut",
                                "Inupiaq",
                                "Mohawk",
                                "Navajo",
                                "Ojibwe",
                                "Tlingit",
                                // AMERICAS - Central & South
                                "AMERICAS - Central & South",
                                "Aymara",
                                "Guarani",
                                "Mapudungun",
                                "Mayan (Yucatec)",
                                "Quechua",
                                "Rapa Nui",
                                "Rapanui",
                                "Sranan Tongo",
                                "Zapotec",
                                // OCEANIA
                                "OCEANIA",
                                "Bislama",
                                "Fijian",
                                "Maori",
                                "Marshallese",
                                "Niuean",
                                "Samoan",
                                "Tahitian",
                                "Tetum",
                                "Tongan",
                                // OTHER/UNCLASSIFIED
                                "OTHER/UNCLASSIFIED",
                                "Angas (Ngas)",
                                "Carolinian",
                                "Chamorro",
                                "Ebira",
                                "Fon",
                                "Glosa",
                                "Hawaiian",
                                "Ido",
                                "Iban",
                                "Isoko",
                                "Jju",
                                "Jukun",
                                "Kawi",
                                "Kutenai",
                                "Lojban",
                                "Manchu",
                                "Minionese (Despicable Me)",
                                "Mende",
                                "Mossi",
                                "Nama",
                                "Nogai",
                                "North Frisian",
                                "Novial",
                                "Nyanja",
                                "Old Church Slavonic",
                                "Old English",
                                "Old French",
                                "Old High German",
                                "Old Norse",
                                "Old Prussian",
                                "Other",
                                "Palauan",
                                "Pali",
                                "Phoenician",
                                "Rusyn",
                                "Shan",
                                "Sotho",
                                "Twi",
                                // CONSTRUCTED & FICTIONAL LANGUAGES
                                "CONSTRUCTED & FICTIONAL LANGUAGES",
                                "Al Bhed (Final Fantasy)",
                                "Ancient Egyptian",
                                "Atlantean (Disney)",
                                "Babm",
                                "Barsoomian (Martian, Burroughs)",
                                "Black Speech (Tolkien)",
                                "Brithenig",
                                "Cityspeak (Blade Runner)",
                                "Clockwork Orange Nadsat",
                                "Cockney Rhyming Slang",
                                "D'ni (Myst)",
                                "Dovahzul (Skyrim)",
                                "Dothraki",
                                "Enochian",
                                "Esperanto",
                                "Furbish (Furby)",
                                "Gargish (Ultima)",
                                "Gnommish (Artemis Fowl)",
                                "Goa'uld (Stargate)",
                                "Huttese (Star Wars)",
                                "Interlingua",
                                "Interlingue (Occidental)",
                                "Klingon (tlhIngan Hol)",
                                "Kobold (D&D)",
                                "Kryptonian",
                                "Lapine (Watership Down)",
                                "Laadan",
                                "Lojban",
                                "Minionese (Despicable Me)",
                                "Na'vi",
                                "Newspeak (Orwell)",
                                "Old Tongue (Wheel of Time)",
                                "Parseltongue (Harry Potter)",
                                "Quenya (Elvish)",
                                "R'lyehian",
                                "Rohirric (Tolkien)",
                                "Simlish (The Sims)",
                                "Sindarin (Elvish)",
                                "Solresol",
                                "Star Wars Basic",
                                "Syldavian (Tintin)",
                                "Tengwar (Tolkien)",
                                "Toki Pona",
                                "Valyrian (High Valyrian)",
                                "Vulcan (Star Trek)",
                              ];
                              // Remove duplicates, but keep the first occurrence (preserves group order)
                              const seen = new Set();
                              const languages = rawLanguages.filter((l) => {
                                if (seen.has(l)) return false;
                                seen.add(l);
                                return true;
                              });
                              const GROUPS = [
                                "AFRICA - West",
                                "AFRICA - East",
                                "AFRICA - Central & Southern",
                                "AFRICA - North",
                                "ASIA - South",
                                "ASIA - Southeast",
                                "ASIA - East",
                                "ASIA - Central & North",
                                "MIDDLE EAST & WESTERN ASIA",
                                "EUROPE - Western & Northern",
                                "EUROPE - Eastern & Central",
                                "EUROPE - Minority & Other",
                                "AMERICAS - North",
                                "AMERICAS - Central & South",
                                "OCEANIA",
                                // Non-geographic groups are never shown as groups in the dropdown
                              ];
                              // Two-pane: only show languages (no group rows) in right pane
                              const rightPaneLanguages = languages.filter(
                                (l) => {
                                  if (
                                    (GROUPS as readonly string[]).includes(
                                      l as any,
                                    )
                                  )
                                    return false;
                                  const g = getGroupForLanguage(l) || "";
                                  return (
                                    g !== "OTHER/UNCLASSIFIED" &&
                                    g !== "CONSTRUCTED & FICTIONAL LANGUAGES"
                                  );
                                },
                              );
                              // Limit to the selected category only; if none, show only the discovered non-geo option (if any)
                              const selectedGroup = (() => {
                                const g = getGroupForLanguage(language);
                                if (
                                  g &&
                                  g !== "OTHER/UNCLASSIFIED" &&
                                  g !== "CONSTRUCTED & FICTIONAL LANGUAGES"
                                )
                                  return g;
                                return "";
                              })();
                              let subset = selectedGroup
                                ? rightPaneLanguages.filter(
                                  (l) =>
                                    (getGroupForLanguage(l) || "") ===
                                    selectedGroup,
                                )
                                : typeof nonGeoOption !== "undefined" &&
                                  nonGeoOption
                                  ? [nonGeoOption]
                                  : [];
                              return subset.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    </div>
                    {language === "Other" && (
                      <div className="mt-2">
                        <label className="text-xs">
                          Specify language/dialect
                        </label>
                        <input
                          className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                          placeholder="e.g., Nigerian Pidgin, Catalan, Punjabi (Shahmukhi)"
                          value={otherLanguage}
                          onChange={(e) => setOtherLanguage(e.target.value)}
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Agent will respond in the selected language. Domain is
                      locked per session; stop to change it.
                    </p>
                    <details className="rounded-md border p-0 overflow-hidden">
                      <summary className="cursor-pointer flex items:center justify:between">
                        <span className="text-sm font-medium">World map</span>
                      </summary>
                      <WorldRegionMap
                        className="mt-3"
                        selected={
                          (() => {
                            const group = getGroupForLanguage(language);
                            if (group) return group as any;
                            return undefined;
                          })() as any
                        }
                        onSelect={(region: any) => {
                          // Selecting a region will filter the dropdown to the first matching language commonly used there
                          const regionDefault: Record<string, string> = {
                            "AMERICAS - North": "English (US)",
                            "AMERICAS - Central & South": "Spanish",
                            "EUROPE - Western & Northern": "English (British)",
                            "EUROPE - Eastern & Central": "Polish",
                            "EUROPE - Minority & Other": "Catalan",
                            "AFRICA - North": "Arabic (Morocco)",
                            "AFRICA - West": "Pidgin English (Nigerian Pidgin)",
                            "AFRICA - East": "Swahili",
                            "AFRICA - Central & Southern": "Zulu",
                            "MIDDLE EAST & WESTERN ASIA": "Arabic (MSA)",
                            "ASIA - South": "Hindi",
                            "ASIA - Southeast": "Indonesian",
                            "ASIA - East": "Chinese (Mandarin)",
                            "ASIA - Central & North": "Kazakh",
                            OCEANIA: "Maori",
                            // For non-geographic groups, keep the exact selected language
                            "OTHER/UNCLASSIFIED": language,
                            "CONSTRUCTED & FICTIONAL LANGUAGES": language,
                          };
                          const pick = regionDefault[region] || language;
                          setLanguage(pick);
                          try {
                            const w = (account?.address || "").toLowerCase();
                            if (w)
                              fetch("/api/sessions/log", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  wallet: w,
                                  sessionId,
                                  type: "param_change",
                                  data: {
                                    key: "language_region",
                                    value: region,
                                    pick,
                                  },
                                }),
                              }).catch(() => { });
                          } catch { }
                        }}
                      />
                    </details>
                  </div>
                  {/* Platform & Role after World map */}
                  <div
                    id="platform-role"
                    className="space-y-4 border-t border-foreground/10 pt-6"
                  >
                    <div className="flex items:start justify:between gap-4">
                      <div>
                        <h3 className="text-base font-semibold">
                          Platform & Guests
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Let the agent adapt to your environment && lineup.
                        </p>
                      </div>
                    </div>
                    <details
                      className={`rounded-md border p-3 bg-background/50 mt-3 ${dirty?.platform || dirty?.role || dirty?.domain || dirty?.link ? "ring-dirty" : active?.platform || active?.role || active?.domain || active?.link ? "ring-active" : ""}`}
                    >
                      <summary className="cursor-pointer flex items:center justify:between">
                        <span className="text-sm font-medium">
                          Platform & Role
                        </span>
                      </summary>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs">Platform</label>
                          <select
                            className="w-full h-9 px-2 border rounded-md bg-background"
                            value={platform}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPlatform(v);
                              try {
                                setDirty((d) => ({
                                  ...(d || {}),
                                  platform: true,
                                }));
                              } catch { }
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w && isListening)
                                  fetch("/api/users/presence", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-wallet": w,
                                    },
                                    body: JSON.stringify({
                                      live: true,
                                      sessionId,
                                      platform: v,
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                          >
                            <option value="auto">Auto</option>
                            <option value="x">X (Twitter)</option>
                            <option value="zoom">Zoom</option>
                            <option value="google_meet">Google Meet</option>
                            <option value="clubhouse">Clubhouse</option>
                            <option value="twitch">Twitch</option>
                            <option value="youtube_live">YouTube Live</option>
                            <option value="discord_stage">Discord Stage</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs">Agent role</label>
                          <select
                            className="w-full h-9 px-2 border rounded-md bg-background"
                            value={agentRole}
                            onChange={(e) => setAgentRole(e.target.value)}
                          >
                            <option value="auto">Auto</option>
                            <option value="host">Host</option>
                            <option value="cohost">Co-host</option>
                            <option value="moderator">Moderator</option>
                            <option value="interpreter">Interpreter</option>
                            <option value="announcer">Announcer</option>
                            <option value="commentator">Commentator</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs">Host name</label>
                          <input
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            placeholder="Your name"
                            value={hostName}
                            onChange={(e) => {
                              setHostName(e.target.value);
                              try {
                                setDirty((d) => ({ ...(d || {}), role: true }));
                              } catch { }
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="text-xs">Add a guest</label>
                          <div className="flex items:center gap-2">
                            <input
                              className="flex-1 h-9 px-3 py-1 border rounded-md bg-background"
                              placeholder="e.g., Alice"
                              value={guestNames}
                              onChange={(e) => setGuestNames(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const v = (guestNames || "").trim();
                                  if (v && !guestList.includes(v)) {
                                    setGuestList([...guestList, v]);
                                    setGuestNames("");
                                  }
                                }
                              }}
                            />
                            <button
                              className="h-9 px-3 rounded-md border"
                              onClick={() => {
                                const v = (guestNames || "").trim();
                                if (v && !guestList.includes(v)) {
                                  setGuestList([...guestList, v]);
                                  setGuestNames("");
                                }
                              }}
                            >
                              Add
                            </button>
                          </div>
                          {guestList.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {guestList.map((g, idx) => {
                                const hues = [
                                  15, 25, 35, 45, 155, 195, 225, 265, 285, 305,
                                ];
                                const hue = hues[idx % hues.length];
                                return (
                                  <span
                                    key={`${g}-${idx}`}
                                    className="inline-flex items:center gap-1 px-2 py-1 rounded-full text-xs"
                                    style={{
                                      background: `hsl(${hue} 90% 20% / 0.25)`,
                                      border: `1px solid hsl(${hue} 70% 45% / 0.6)`,
                                    }}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{
                                        background: `hsl(${hue} 70% 50%)`,
                                      }}
                                    />
                                    {g}
                                    <button
                                      className="ml-1 opacity-80 hover:opacity-100"
                                      onClick={() =>
                                        setGuestList(
                                          guestList.filter((x) => x !== g),
                                        )
                                      }
                                    >
                                      {"\u00D7"}
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-1">
                          <label className="text-xs">Domain for session</label>
                          <select
                            className="w-full h-9 px-2 border rounded-md bg-background"
                            value={sessionDomain}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSessionDomain(v);
                              try {
                                setDirty((d) => ({
                                  ...(d || {}),
                                  domain: true,
                                }));
                              } catch { }
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w && isListening && v && v !== "auto")
                                  fetch("/api/users/presence", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-wallet": w,
                                    },
                                    body: JSON.stringify({
                                      live: true,
                                      sessionId,
                                      domain: v,
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                          >
                            <option value="auto">Auto</option>
                            <option value="engineering">Engineering</option>
                            <option value="product">Product</option>
                            <option value="design">Design</option>
                            <option value="education">Education</option>
                            <option value="media">Media</option>
                            <option value="generalist">Generalist</option>
                            <option value="finance">Finance</option>
                            <option value="health">Health</option>
                            <option value="legal">Legal</option>
                            <option value="marketing">Marketing</option>
                            <option value="ai_safety">AI Safety</option>
                            <option value="machine_learning">
                              Machine Learning
                            </option>
                            <option value="cloud">Cloud</option>
                            <option value="devops">DevOps</option>
                            <option value="blockchain">Blockchain</option>
                            <option value="defi">DeFi</option>
                            <option value="security">Security</option>
                            <option value="gaming">Gaming</option>
                            <option value="sports">Sports</option>
                            <option value="music">Music</option>
                            <option value="film">Film</option>
                            <option value="politics">Politics</option>
                            <option value="economics">Economics</option>
                            <option value="psychology">Psychology</option>
                            <option value="philosophy">Philosophy</option>
                            <option value="mathematics">Mathematics</option>
                            <option value="physics">Physics</option>
                            <option value="biology">Biology</option>
                            <option value="chemistry">Chemistry</option>
                            <option value="history">History</option>
                            <option value="literature">Literature</option>
                            <option value="art">Art</option>
                          </select>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Live Now uses this domain for the current session.
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        The agent adapts etiquette for platforms like X, Zoom,
                        Google Meet, Clubhouse, Twitch, YouTube Live, && more.
                      </p>
                    </details>
                  </div>
                </div>
                <div
                  id="prompt-behavior"
                  className="space-y-6 border-t border-foreground/10 pt-6"
                >
                  <div className="flex items:start justify:between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        Prompt & Behavior
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Dial in detection, cadence, && your system prompt.
                      </p>
                    </div>
                  </div>
                  <details className="rounded-md border p-3 bg-background/50">
                    <summary className="cursor-pointer flex items:center justify:between">
                      <span className="text-sm font-medium">
                        Server turn detection
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="text-xs">Threshold</label>
                        <div className="flex items:center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={vadThreshold}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setVadThreshold(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w)
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "vadThreshold", value: v },
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                            className="glass-range w-full"
                          />
                          <input
                            className="w-20 h-8 px-2 border rounded-md bg-background"
                            value={vadThreshold}
                            onChange={(e) =>
                              setVadThreshold(parseFloat(e.target.value || "0"))
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs">Prefix padding (ms)</label>
                        <div className="flex items:center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1000}
                            step={10}
                            value={vadPrefixMs}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setVadPrefixMs(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w)
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "vadPrefixMs", value: v },
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                            className="glass-range w-full"
                          />
                          <input
                            className="w-20 h-8 px-2 border rounded-md bg-background"
                            value={vadPrefixMs}
                            onChange={(e) =>
                              setVadPrefixMs(parseInt(e.target.value || "0"))
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs">Silence duration (ms)</label>
                        <div className="flex items:center gap-3">
                          <input
                            type="range"
                            min={100}
                            max={2000}
                            step={10}
                            value={vadSilenceMs}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setVadSilenceMs(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w)
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "vadSilenceMs", value: v },
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                            className="glass-range w-full"
                          />
                          <input
                            className="w-20 h-8 px-2 border rounded-md bg-background"
                            value={vadSilenceMs}
                            onChange={(e) =>
                              setVadSilenceMs(parseInt(e.target.value || "0"))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </details>
                  <details className="rounded-md border p-3 bg-background/50">
                    <summary className="cursor:pointer flex items:center justify:between">
                      <span className="text-sm font-medium">Parameters</span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="text-xs">Max response</label>
                        <div className="flex items:center gap-3">
                          <input
                            type="range"
                            min={128}
                            max={2000}
                            step={16}
                            value={maxResponse}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value);
                              const v = Math.min(2000, Math.max(128, raw));
                              setMaxResponse(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w)
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "maxResponse", value: v },
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                            className="glass-range w-full"
                          />
                          <input
                            className="w-24 h-8 px-2 border rounded-md bg-background"
                            value={maxResponse}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value || "0");
                              const v = Math.min(2000, Math.max(128, raw));
                              setMaxResponse(v);
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs">Temperature</label>
                        <div className="flex items:center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={temperature}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setTemperature(v);
                              try {
                                const w = (
                                  account?.address || ""
                                ).toLowerCase();
                                if (w)
                                  fetch("/api/sessions/log", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      wallet: w,
                                      sessionId,
                                      type: "param_change",
                                      data: { key: "temperature", value: v },
                                    }),
                                  }).catch(() => { });
                              } catch { }
                            }}
                            className="glass-range w-full"
                          />
                          <input
                            className="w-20 h-8 px-2 border rounded-md bg-background"
                            value={temperature}
                            onChange={(e) =>
                              setTemperature(parseFloat(e.target.value || "0"))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </details>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">System Prompt</label>
                    <textarea
                      ref={systemPromptRef}
                      className="w-full min-h-[120px] px-3 py-2 border rounded-md bg-background"
                      value={systemPrompt}
                      onChange={(e) => {
                        setSystemPrompt(e.target.value);
                        try {
                          setDirty((d) => ({ ...(d || {}), prompt: true }));
                        } catch { }
                      }}
                      onSelect={updatePromptSelection}
                      onKeyUp={updatePromptSelection}
                      onMouseUp={updatePromptSelection}
                    />
                    <div className="flex flex-wrap items:center gap-2">
                      <div className="relative inline-block" ref={ipaMenuRef}>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={handleOpenIpaMenu}
                          disabled={
                            !promptSelection ||
                            !promptSelection.text.trim() ||
                            ipaLoading
                          }
                        >
                          {ipaLoading ? "Loading IPA..." : "Convert to IPA"}
                        </button>
                        {ipaMenuOpen && (
                          <div className="absolute z-40 mt-2 w-64 glass-float rounded-xl border bg-background p-2 space-y-1">
                            {ipaLoading && (
                              <div className="px-2 py-2 text-xs text-muted-foreground">
                                Loading...
                              </div>
                            )}
                            {!ipaLoading && ipaError && (
                              <div className="px-2 py-2 text-xs text-red-500">
                                {ipaError}
                              </div>
                            )}
                            {!ipaLoading &&
                              ipaOptions.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className="w-full text-left px-2 py-2 rounded hover:bg-foreground/5"
                                  onClick={() => applyIpaOption(opt)}
                                >
                                  {opt}
                                </button>
                              ))}
                            {!ipaLoading &&
                              !ipaError &&
                              ipaOptions.length === 0 && (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                  No IPA suggestions available.
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border"
                        onClick={async () => {
                          try {
                            const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                            const w = ((account?.address || "") || fallback).toLowerCase();
                            if (!w) {
                              setToolStatus("No wallet configured; connect or set voicehub:wallet");
                              return;
                            }
                            const rPull = await fetch("/api/crm/prompt/pull", {
                              headers: { "x-wallet": w },
                              cache: "no-store",
                            });
                            const jPull = await rPull.json().catch(() => ({}));
                            const p = jPull?.stored?.prompt || jPull?.prompt || "";
                            if (rPull.ok && typeof p === "string" && p.trim()) {
                              setSystemPrompt(p);
                              latestPromptRef.current = p;
                              setToolStatus("Pulled System Prompt from CRM");
                            } else {
                              setToolStatus("No prompt stored for your wallet");
                            }
                          } catch {
                            setToolStatus("Failed to refresh prompt");
                          }
                        }}
                      >
                        Refresh from CRM
                      </button>
                      <button
                        onClick={async () => {
                          try {

                            // Attempt to pull latest System Prompt from CRM and apply before sending
                            try {
                              const fallback = typeof window !== "undefined" ? (window.localStorage.getItem("voicehub:wallet") || "") : "";
                              const w = ((account?.address || "") || fallback).toLowerCase();
                              if (w) {
                                const rPull = await fetch("/api/crm/prompt/pull", {
                                  headers: { "x-wallet": w },
                                });
                                const jPull = await rPull.json().catch(() => ({}));
                                const p = jPull?.stored?.prompt || jPull?.prompt || "";
                                if (rPull.ok && typeof p === "string" && p.trim()) {
                                  setSystemPrompt(p);
                                  latestPromptRef.current = p;
                                  setToolStatus("Pulled System Prompt from CRM");
                                }
                              }
                            } catch { }

                            const ch = dataChannelRef.current;
                            if (ch && ch.readyState === "open") {
                              sendInstructions("Prompt (manual)");
                              setToolStatus("Prompt applied");
                              try {
                                setActive((a) => ({
                                  ...(a || {}),
                                  prompt: true,
                                }));
                              } catch { }
                            } else {
                              setToolStatus(
                                "Prompt saved (will apply on next start)",
                              );
                            }
                            try {
                              if (typeof window !== "undefined")
                                window.localStorage.setItem(
                                  "cb:systemPrompt",
                                  systemPrompt || "",
                                );
                            } catch { }
                            try {
                              const w = (account?.address || "").toLowerCase();
                              if (w)
                                fetch("/api/sessions/log", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    wallet: w,
                                    sessionId,
                                    type: "prompt_apply",
                                    data: {
                                      manual: true,
                                      length: (systemPrompt || "").length,
                                      language,
                                    },
                                  }),
                                }).catch(() => { });
                            } catch { }
                            // Apply presence-related changes in one shot
                            try {
                              await sendPresenceNow();
                            } catch { }
                            // Mark all dirty sections as active and clear dirty flags
                            try {
                              setActive((a) => ({
                                ...(a || {}),
                                language:
                                  dirty?.language || a?.language
                                    ? true
                                    : a?.language || false,
                                platform:
                                  dirty?.platform || a?.platform
                                    ? true
                                    : a?.platform || false,
                                role:
                                  dirty?.role || a?.role
                                    ? true
                                    : a?.role || false,
                                domain:
                                  dirty?.domain || a?.domain
                                    ? true
                                    : a?.domain || false,
                                link:
                                  dirty?.link || a?.link
                                    ? true
                                    : a?.link || false,
                                params:
                                  dirty?.params || a?.params
                                    ? true
                                    : a?.params || false,
                                prompt:
                                  dirty?.prompt || a?.prompt
                                    ? true
                                    : a?.prompt || false,
                              }));
                              setDirty({});
                            } catch { }
                          } catch { }
                        }}
                        className={`px-3 py-1.5 rounded-md border ${Object.values(dirty || {}).some(Boolean) ? "ring-dirty" : ""}`}
                      >
                        Apply Settings
                      </button>
                      <div className="relative inline-block">
                        <button
                          onClick={() => setRollOpen((v) => !v)}
                          className="px-3 py-1.5 rounded-md border"
                        >
                          Generate Prompt
                        </button>
                        {rollOpen && (
                          <div className="absolute z-40 mt-2 w-[520px] p-4 glass-float rounded-xl border space-y-3">
                            <div>
                              <label className="text-xs opacity-80">
                                Theme / vibe
                              </label>
                              <input
                                className="w-full h-9 px-3 py-1 border rounded-md bg-background/70"
                                placeholder="e.g., witty scientist, stoic strategist"
                                value={rollTheme}
                                onChange={(e) => setRollTheme(e.target.value)}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs opacity-80">
                                Topics (add comma-separated)
                              </label>
                              <input
                                className="w-full h-9 px-3 py-1 border rounded-md bg-background/70"
                                placeholder="e.g., AI safety, football tactics, DeFi, pop psychology"
                                value={rollTopics.join(", ")}
                                onChange={(e) =>
                                  setRollTopics(
                                    e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  )
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h:[60vh] overflow:auto pr-1">
                              <div>
                                <label className="text-xs opacity-80">
                                  Archetype
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollArchetype}
                                  onChange={(e) =>
                                    setRollArchetype(e.target.value)
                                  }
                                >
                                  <option value="auto">Auto</option>
                                  <option value="historian">Historian</option>
                                  <option value="scientist">Scientist</option>
                                  <option value="detective">Detective</option>
                                  <option value="coach">Coach</option>
                                  <option value="journalist">Journalist</option>
                                  <option value="librarian">Librarian</option>
                                  <option value="mentor">Mentor</option>
                                  <option value="storyteller">
                                    Storyteller
                                  </option>
                                  <option value="strategist">Strategist</option>
                                  <option value="researcher">Researcher</option>
                                  <option value="engineer">Engineer</option>
                                  <option value="teacher">Teacher</option>
                                  <option value="therapist">Therapist</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Tone
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollTone}
                                  onChange={(e) => setRollTone(e.target.value)}
                                >
                                  <option value="auto">Auto</option>
                                  <option value="friendly">Friendly</option>
                                  <option value="professional">
                                    Professional
                                  </option>
                                  <option value="witty">Witty</option>
                                  <option value="serious">Serious</option>
                                  <option value="supportive">Supportive</option>
                                  <option value="cheerful">Cheerful</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Style
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollStyle}
                                  onChange={(e) => setRollStyle(e.target.value)}
                                >
                                  <option value="auto">Auto</option>
                                  <option value="socratic">Socratic</option>
                                  <option value="stepwise">Stepwise</option>
                                  <option value="bullet">Bullet points</option>
                                  <option value="narrative">Narrative</option>
                                  <option value="debate">Debate</option>
                                  <option value="tutorial">Tutorial</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Domain focus
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollDomain}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setRollDomain(v);
                                    try {
                                      const w = (
                                        account?.address || ""
                                      ).toLowerCase();
                                      if (w && isListening && v && v !== "auto")
                                        fetch("/api/users/presence", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            "x-wallet": w,
                                          },
                                          body: JSON.stringify({
                                            live: true,
                                            sessionId,
                                            domain: v,
                                          }),
                                        }).catch(() => { });
                                    } catch { }
                                  }}
                                  disabled={!!domainLocked}
                                >
                                  <option value="auto">Auto</option>
                                  <option value="engineering">
                                    Engineering
                                  </option>
                                  <option value="product">Product</option>
                                  <option value="design">Design</option>
                                  <option value="education">Education</option>
                                  <option value="media">Media</option>
                                  <option value="generalist">Generalist</option>
                                  <option value="finance">Finance</option>
                                  <option value="health">Health</option>
                                  <option value="legal">Legal</option>
                                  <option value="marketing">Marketing</option>
                                  <option value="ai_safety">AI Safety</option>
                                  <option value="machine_learning">
                                    Machine Learning
                                  </option>
                                  <option value="cloud">Cloud</option>
                                  <option value="devops">DevOps</option>
                                  <option value="blockchain">Blockchain</option>
                                  <option value="defi">DeFi</option>
                                  <option value="security">Security</option>
                                  <option value="gaming">Gaming</option>
                                  <option value="sports">Sports</option>
                                  <option value="music">Music</option>
                                  <option value="film">Film</option>
                                  <option value="politics">Politics</option>
                                  <option value="economics">Economics</option>
                                  <option value="psychology">Psychology</option>
                                  <option value="philosophy">Philosophy</option>
                                  <option value="mathematics">
                                    Mathematics
                                  </option>
                                  <option value="physics">Physics</option>
                                  <option value="biology">Biology</option>
                                  <option value="chemistry">Chemistry</option>
                                  <option value="history">History</option>
                                  <option value="literature">Literature</option>
                                  <option value="art">Art</option>
                                </select>
                                {domainLocked ? (
                                  <p className="text-[10px] mt-1 text-muted-foreground">
                                    Domain locked for this session. Stop to
                                    change.
                                  </p>
                                ) : (
                                  <button
                                    className="mt-1 text-[10px] underline"
                                    onClick={() =>
                                      setDomainLocked(
                                        rollDomain !== "auto" ? rollDomain : "",
                                      )
                                    }
                                  >
                                    {rollDomain !== "auto"
                                      ? "Lock domain for session"
                                      : "Pick a domain to lock"}
                                  </button>
                                )}
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Quirkiness
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollQuirk}
                                  onChange={(e) => setRollQuirk(e.target.value)}
                                >
                                  <option value="low">Low</option>
                                  <option value="balanced">Balanced</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Formatting
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollFormatting}
                                  onChange={(e) =>
                                    setRollFormatting(e.target.value)
                                  }
                                >
                                  <option value="auto">Auto</option>
                                  <option value="bulleted">Bulleted</option>
                                  <option value="numbered">Numbered</option>
                                  <option value="compact">Compact</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs opacity-80">
                                  Length
                                </label>
                                <select
                                  className="w-full h-9 px-2 border rounded-md bg-background/70"
                                  value={rollLength}
                                  onChange={(e) =>
                                    setRollLength(e.target.value)
                                  }
                                >
                                  <option value="short">Short</option>
                                  <option value="medium">Medium</option>
                                  <option value="long">Long</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex justify:end gap-2 pt-1">
                              <button
                                className="px-3 py-1.5 rounded-md border"
                                onClick={() => setRollOpen(false)}
                              >
                                Cancel
                              </button>
                              <button
                                className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]"
                                onClick={async () => {
                                  setToolStatus("Rolling...");
                                  try {
                                    const r = await fetch("/api/prompt/roll", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        theme: rollTheme,
                                        archetype: rollArchetype,
                                        tone: rollTone,
                                        style: rollStyle,
                                        domain: rollDomain,
                                        quirk: rollQuirk,
                                        formatting: rollFormatting,
                                        length: rollLength,
                                        topics: rollTopics,
                                      }),
                                    });
                                    const j = await r.json().catch(() => ({}));
                                    if (j?.prompt) setSystemPrompt(j.prompt);
                                    // Log prompt roll
                                    try {
                                      const w = (
                                        account?.address || ""
                                      ).toLowerCase();
                                      if (w)
                                        fetch("/api/sessions/log", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            wallet: w,
                                            sessionId,
                                            type: "prompt_roll",
                                            data: {
                                              theme: rollTheme,
                                              archetype: rollArchetype,
                                              tone: rollTone,
                                              style: rollStyle,
                                              domain: rollDomain,
                                              quirk: rollQuirk,
                                              formatting: rollFormatting,
                                              length: rollLength,
                                              topics: rollTopics,
                                            },
                                          }),
                                        }).catch(() => { });
                                    } catch { }
                                    setToolStatus(
                                      j?.degraded
                                        ? `Rolled (fallback)${j?.reason ? `: ${j.reason}` : ""}`
                                        : "Rolled",
                                    );
                                    setRollOpen(false);
                                  } catch {
                                    setToolStatus("Roll failed");
                                  }
                                }}
                              >
                                Roll
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="microtext text-muted-foreground">
                        Changes sync live when connected
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap items:center gap-3 microtext">
                  <span>
                    Session time: {Math.floor(sessionSeconds / 60)}m{" "}
                    {sessionSeconds % 60}s
                  </span>
                  <span suppressHydrationWarning>
                    Total today (local): {Math.floor(usedToday / 60)}m{" "}
                    {usedToday % 60}s
                  </span>
                  <span suppressHydrationWarning>
                    Wallet: {(account?.address || "").slice(0, 6)}...
                    {(account?.address || "").slice(-4)}
                  </span>
                  <span>
                    Rate:{" "}
                    {(() => {
                      const r = rates[currency] || 1;
                      return currency === "ETH"
                        ? `${ethPer2Min} ETH / 2 min`
                        : `${(ethPer2Min * r).toFixed(4)} ${currency} / 2 min`;
                    })()}
                  </span>
                </div>
                <div className="flex items:center gap-3">
                  <button
                    onClick={() => {
                      if (!isListening) setShowConfirm(true);
                      else stopSession();
                    }}
                    disabled={
                      !isListening &&
                      (!account?.address ||
                        (!isOwner && (!balance || balance.balanceSeconds <= 0)))
                    }
                    title={
                      !account?.address
                        ? "Connect wallet"
                        : !isOwner &&
                          (!balance || balance.balanceSeconds <= 0) &&
                          !isListening
                          ? "Insufficient credit"
                          : ""
                    }
                    className={`px-4 py-2 rounded-md ${isListening ? "border" : "bg-[var(--primary)] text-[var(--primary-foreground)]"} transition disabled:opacity-60`}
                  >
                    <span className="inline-flex items:center gap-2">
                      {isListening ? <EarOffIcon /> : <EarIcon />}
                      <span className="font-medium">
                        {isListening ? "Stop Listening" : "Start Listening"}
                      </span>
                    </span>
                  </button>
                  {isSilenced && (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md border"
                      title={`Resume now (${Math.floor(silenceSeconds / 60)}:${String(silenceSeconds % 60).padStart(2, "0")} left)`}
                      onClick={stopSilence}
                    >
                      <span className="inline-flex items:center gap-2">
                        <EarIcon />
                        <span className="font-medium">
                          Resume Now ({Math.floor(silenceSeconds / 60)}:{String(silenceSeconds % 60).padStart(2, "0")} left)
                        </span>
                      </span>
                    </button>
                  )}
                  {!account?.address && !isListening && (
                    <span className="microtext text-red-500">
                      Connect your wallet to start a session.
                    </span>
                  )}
                  {!isOwner &&
                    !isListening &&
                    (!balance || balance.balanceSeconds <= 0) &&
                    !!account?.address && (
                      <span className="microtext text-red-500">
                        Insufficient credit. Purchase minutes on Pricing.
                      </span>
                    )}
                </div>
                <div className="microtext text-muted-foreground">
                  {audioBlocked && (
                    <button
                      type="button"
                      className="mb-1 px-2 py-1 rounded border"
                      onClick={async () => {
                        try {
                          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
                            await audioCtxRef.current.resume();
                          }
                          const a = audioRef.current || agentOutRef.current;
                          if (a) {
                            a.muted = false;
                            a.volume = 1;
                            await a.play();
                          }
                          setAudioBlocked(false);
                          setToolStatus("Audio enabled");
                        } catch {
                          setToolStatus("Audio unblock failed; click again");
                        }
                      }}
                      title="Enable audio playback"
                    >
                      Enable Audio
                    </button>
                  )}
                  <div className="font-medium text-xs mb-1">RECENT TOOL CALLS</div>
                  <div
                    className="text-xs"
                    style={{
                      transition: "opacity 300ms ease-in-out",
                      opacity: statusPhase === "out" ? 0 : 1,
                    }}
                  >
                    {toolBusy && currentTool ? (
                      <>
                        <span className="font-semibold">Running tool:</span> {currentTool.name}{" "}
                        <span className="opacity-70">
                          — {Math.max(0, Math.floor((Date.now() - currentTool.started) / 1000))}s
                        </span>
                      </>
                    ) : toolCalls[0]?.name ? (
                      <>
                        <span className="font-semibold">Last tool:</span> {toolCalls[0].name}{" "}
                        <span className="opacity-80">
                          {(() => {
                            try {
                              const s = JSON.stringify(toolCalls[0].args);
                              return s ? "— " + s : "";
                            } catch {
                              return "";
                            }
                          })()}
                        </span>
                      </>
                    ) : (
                      <>{toolStatus || "No events yet. Start a session and interact."}</>
                    )}
                  </div>
                </div>
                <details className="rounded-md border p-3 bg-background/50">
                  <summary
                    className="cursor-pointer px-4 py-3 text-sm font-semibold flex items:center justify:between"
                    style={{
                      background: "color-mix(in srgb, var(--primary) 16%, transparent)",
                      borderBottom: "1px solid color-mix(in srgb, var(--primary) 38%, transparent)",
                    }}
                  >
                    <span className="text-sm font-medium">Reasoning Stream</span>
                  </summary>
                  <div className="p-3 microtext text-muted-foreground">
                    <div>Realtime: {dcState}</div>
                    <div className="font-medium text-xs mt-2 mb-1">Recent realtime events</div>
                    <ul className="text-xs space-y-0.5">
                      {debugEvents.slice(0, 10).map((e, idx) => (
                        <li key={e.t + "-" + idx}>
                          <span className="font-mono">{new Date(e.t).toLocaleTimeString()}</span>
                          {" — "}
                          <span className="font-semibold">{e.type}</span>
                          {e.name ? ` (${e.name})` : ""}
                          {e.info ? `: ${e.info}` : ""}
                        </li>
                      ))}
                      {debugEvents.length === 0 && (
                        <li className="opacity-70">No events yet. Start a session && interact.</li>
                      )}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="px-3 py-1.5 rounded-md border"
                        onClick={() => {
                          try {
                            setToolStatus("Debug: start_silence 5s");
                            setToolCalls((prev) => [{ name: "start_silence", args: { seconds: 5 }, t: Date.now() }, ...prev].slice(0, 10));
                            startSilence(5);
                          } catch { }
                        }}
                        title="Simulate a silence tool call for 5 seconds"
                      >
                        Test: Silence 5s
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md border"
                        onClick={() => {
                          try {
                            window.dispatchEvent(new CustomEvent("cb:hostStart"));
                            setToolCalls((prev) => [{ name: "host_start", args: {}, t: Date.now() }, ...prev].slice(0, 10));
                            setToolStatus("Debug: dispatched host_start");
                          } catch { }
                        }}
                        title="Dispatch host_start event"
                      >
                        Test: Host Start
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md border"
                        onClick={() => {
                          try {
                            const a = mediaAudioRef.current;
                            if (a) {
                              a.muted = false;
                              a.loop = false;
                              a.volume = Math.max(0, Math.min(1, a.volume || 1));
                              a.play().catch(() => { });
                            }
                            setToolCalls((prev) => [{ name: "media_play", args: {}, t: Date.now() }, ...prev].slice(0, 10));
                            setToolStatus("Debug: media_play");
                          } catch { }
                        }}
                        title="Attempt to play Media Player audio"
                      >
                        Test: Media Play
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md border"
                        onClick={() => {
                          try {
                            const a = mediaAudioRef.current;
                            if (a) {
                              a.pause();
                              a.loop = false;
                            }
                            setToolCalls((prev) => [{ name: "media_stop", args: {}, t: Date.now() }, ...prev].slice(0, 10));
                            setToolStatus("Debug: media_stop");
                          } catch { }
                        }}
                        title="Pause Media Player audio"
                      >
                        Test: Media Stop
                      </button>
                    </div>
                  </div>
                </details>
                {speakingText && (
                  <div className="text-xs text-muted-foreground">
                    {speakingText}
                  </div>
                )}
              </div>
            </div>
            <section id="connect-crm">
              <div className="glass-pane rounded-xl border p-5">
                <h2 className="text-lg font-semibold mb-4">Connect CRM</h2>
                <ConnectCrmPanel walletLower={(account?.address || "").toLowerCase()} />
              </div>
            </section>
            <section id="public-space">
              <details className="glass-pane rounded-xl border p-0 overflow:hidden">
                <summary
                  className="cursor:pointer px-4 py-3 text-sm font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                    borderBottom: "1px solid color-mix(in srgb, var(--primary) 34%, transparent)",
                  }}
                >
                  Public Space Visibility
                </summary>
                <div className="p-5">
                  <PublicSpacePanel
                    spaceUrl={spaceUrl}
                    spacePublic={spacePublic}
                    spaceImage={spaceImage}
                    spaceImageUrlInput={spaceImageUrlInput}
                    imageError={spaceImageError}
                    ownerLabel={ownerLabel}
                    ownerSubLabel={ownerSubLabel}
                    tags={previewTags}
                    onSpaceUrlChange={handleSpaceUrlChange}
                    onToggleLive={handleSpacePublicToggle}
                    onImageUrlChange={handleSpaceImageUrlChange}
                    onImageFileSelect={handleSpaceImageFileSelect}
                    onImageClear={handleClearSpaceImage}
                  />
                </div>
              </details>
            </section>
            {/* Host Mode */}
            <section id="host-mode">
              <details className="glass-pane rounded-xl border p-0 overflow:hidden">
                <summary
                  className="cursor:pointer px-4 py-3 text-sm font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--primary) 20%, transparent)",
                    borderBottom: "1px solid color-mix(in srgb, var(--primary) 42%, transparent)",
                  }}
                >
                  Host Mode
                </summary>
                <div className="p-5">
                  <HostModePanel
                    dataChannelRef={dataChannelRef}
                    mediaAudioRef={mediaAudioRef}
                    micVolume={micVolume}
                    agentVolume={agentVolume}
                    isListening={isListening}
                    isSilenced={isSilenced}
                    onSendUserMessage={sendUserMessage}
                    onSendDeveloperMessage={sendDeveloper}
                  />
                </div>
              </details>
            </section>
            {/* Media Player */}
            <section id="media-player">
              <div className="glass-pane rounded-xl border p-5">
                <h2 className="text-lg font-semibold mb-4">Media Player</h2>
                <MediaPlayerPanel
                  mediaAudioRef={mediaAudioRef}
                  analyserMediaRef={analyserMediaRef}
                  rafMediaRef={rafMediaRef}
                  audioCtxRef={audioCtxRef}
                />
              </div>
            </section>
            {/* Second row: Audio setup instructions */}
            <section id="audio-setup">
              <div className="glass-pane rounded-xl border p-5">
                <h2 className="text-lg font-semibold mb-4">Audio Setup</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Windows: use two browsers && VB-Audio virtual cables. Run{" "}
                  <b>CB</b> on <b>Edge</b>, && run your{" "}
                  <b>Space/Meeting/Stream</b> on <b>Chrome</b>. Configure
                  devices to mono 48 kHz in legacy sound settings.
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>
                    <a
                      className="underline"
                      href="https://vb-audio.com/Cable/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      VB-CABLE Virtual Audio Device
                    </a>
                  </li>
                  <li>
                    <a
                      className="underline"
                      href="https://vb-audio.com/Cable/index.htm#DownloadASIOBridge"
                      target="_blank"
                      rel="noreferrer"
                    >
                      HiFi-CABLE & ASIO Bridge
                    </a>
                  </li>
                </ul>
                <ol className="list-decimal pl-5 text-sm space-y-2 mt-3">
                  <li>
                    System {"->"} Sound {"->"} <b>Volume Mixer</b>.
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>
                        <b>Edge (CB):</b> Input Device {"->"} {" "}
                        <b>CABLE Output (VB-Audio Virtual Cable)</b>; Output
                        Device {"->"} <b>Hi-Fi Cable Input (VB-Audio Hi-Fi Cable)</b>
                      </li>
                      <li>
                        <b>Chrome (Space/Meeting/Stream):</b> Input Device {"->"} {" "}
                        <b>Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)</b>; Output
                        Device {"->"} <b>CABLE Input (VB-Audio Virtual Cable)</b>
                      </li>
                    </ul>
                  </li>
                  <li>
                    Click <b>More sound settings</b> to open the legacy
                    interface. In <b>Playback</b> && <b>Recording</b>, set the
                    following to{" "}
                    <b>1 channel, 16 bit, 48000 Hz (DVD Quality)</b> under{" "}
                    <b>Properties {"->"} Advanced</b>:
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>
                        <b>Hi-Fi Cable Input</b> && <b>CABLE Input</b>{" "}
                        (Playback)
                      </li>
                      <li>
                        <b>Hi-Fi Cable Output</b> && <b>CABLE Output</b>{" "}
                        (Recording)
                      </li>
                    </ul>
                  </li>
                  <li className="mt-2">
                    <b>Works with:</b> X (Twitter), Zoom, Google Meet,
                    Clubhouse, Twitch, YouTube Live, Discord Stage, && more.
                    Pick your platform in Platform & Role && the agent will
                    adapt etiquette && timing.
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground mt-3">
                  Need help? Join our Discord:{" "}
                  <a
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href="https://discord.gg/q4tFymyAnx"
                  >
                    discord.gg/q4tFymyAnx
                  </a>
                </p>
                {/* Interactive checklist */}
                <div className="mt-4">
                  <ChecklistComponent
                    title="Interactive Checklist"
                    storageKey="cb:audio:console-checklist"
                    steps={[
                      "Install VB-CABLE and HiFi-CABLE (then reboot)",
                      "Legacy settings: set all Hi-Fi/CABLE I/O to 1 ch, 16-bit, 48000 Hz",
                      "Volume Mixer (Edge/CB): Input -> CABLE Output; Output -> Hi-Fi Cable Input",
                      "Volume Mixer (Chrome/Space): Input -> Hi-Fi Cable Output; Output -> CABLE Input",
                      "Open CB Console in Edge",
                      "Join your space/meeting/stream in Chrome",
                      "Start the agent and verify meters move",
                    ]}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items:center justify:center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowConfirm(false)}
          />
          <div className="glass-pane relative z-50 w-full max-w-md rounded-xl border p-6">
            <h3 className="text-lg font-semibold mb-2">Start session?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              By continuing, the timer will start && charges will begin to
              accrue at 0.001 ETH per 2 minutes (billed by the second, 2-minute
              minimum). Make sure you have available time credit || have
              purchased minutes on the Pricing page.
            </p>
            <div className="flex justify:end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-md border"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAndStart()}
                className="px-4 py-2 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
