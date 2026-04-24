'use client';

import { useId } from 'react';

interface HouseLoaderProps {
  size?: number;
  className?: string;
}

/**
 * Animated house SVG that fills from bottom to top with Beisser green (#006834).
 * Uses SMIL animations so no extra CSS dependencies are needed.
 */
export default function HouseLoader({ size = 24, className = '' }: HouseLoaderProps) {
  const rawId = useId();
  const clipId = `hfill-${rawId.replace(/:/g, '')}`;

  // Animation:
  // 0 → 55%  fill rises from bottom (ease-out)
  // 55% → 82% hold full (pause at the top — house is "complete")
  // 82% → 100% drain quickly back down (ease-in, implies "starting over")
  const keyTimes = '0;0.55;0.82;1';
  const splines = '0.4 0 0.2 1;0 0 1 1;0.8 0 1 0.8';
  const dur = '2.2s';

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      aria-label="Loading"
      role="img"
    >
      <defs>
        <clipPath id={clipId}>
          {/* Rect that sweeps upward to reveal the green fill */}
          <rect x="0" width="40">
            <animate
              attributeName="y"
              values="40;0;0;40"
              keyTimes={keyTimes}
              dur={dur}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines={splines}
            />
            <animate
              attributeName="height"
              values="0;40;40;0"
              keyTimes={keyTimes}
              dur={dur}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines={splines}
            />
          </rect>
        </clipPath>
      </defs>

      {/* ── Chimney ── */}
      {/* Fill layer */}
      <rect x="22" y="4" width="5" height="13" fill="#006834" clipPath={`url(#${clipId})`} />
      {/* Outline — always visible */}
      <rect x="22" y="4" width="5" height="13" fill="none" stroke="#006834" strokeWidth="1.2" opacity="0.25" />

      {/* ── House body ── */}
      {/* Fill layer — Beisser green, rises from bottom */}
      <path
        d="M20 13 L36 22 H32 V36 H8 V22 H4 L20 13 Z"
        fill="#006834"
        clipPath={`url(#${clipId})`}
      />
      {/* Outline — always visible */}
      <path
        d="M20 13 L36 22 H32 V36 H8 V22 H4 L20 13 Z"
        fill="none"
        stroke="#006834"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.25"
      />

      {/* ── Door ── outline only, sits on top of fill so it reads as a cutout */}
      <rect x="16" y="27" width="8" height="9" fill="none" stroke="#006834" strokeWidth="1" opacity="0.3" />

      {/* ── Left window ── */}
      <rect x="9" y="23" width="6" height="5" fill="none" stroke="#006834" strokeWidth="1" opacity="0.2" />

      {/* ── Right window ── */}
      <rect x="25" y="23" width="6" height="5" fill="none" stroke="#006834" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}
