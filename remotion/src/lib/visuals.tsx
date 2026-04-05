import React from "react";
import { AbsoluteFill } from "remotion";
import { colors } from "./theme";

/* ─── Cinematic Letterbox ─── */
export const CinematicLetterbox: React.FC<{
  barHeight?: number;
  opacity?: number;
}> = ({ barHeight = 80, opacity = 1 }) => (
  <>
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: barHeight,
        backgroundColor: "#000",
        opacity,
        zIndex: 10,
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: barHeight,
        backgroundColor: "#000",
        opacity,
        zIndex: 10,
      }}
    />
  </>
);

/* ─── Glass Card ─── */
export const GlassCard: React.FC<{
  children: React.ReactNode;
  width?: number | string;
  padding?: string;
  borderRadius?: number;
  glowColor?: string;
  borderOpacity?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  width,
  padding = "60px 80px",
  borderRadius = 24,
  glowColor,
  borderOpacity = 0.08,
  style,
}) => (
  <div style={{ position: "relative", width, ...style }}>
    {/* Outer glow */}
    {glowColor && (
      <div
        style={{
          position: "absolute",
          inset: -60,
          borderRadius: borderRadius + 60,
          background: `radial-gradient(ellipse, ${glowColor}, transparent 70%)`,
          filter: "blur(40px)",
          opacity: 0.25,
          pointerEvents: "none",
        }}
      />
    )}
    {/* Card */}
    <div
      style={{
        position: "relative",
        padding,
        borderRadius,
        background: "rgba(255, 255, 255, 0.04)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        border: `1px solid rgba(255, 255, 255, ${borderOpacity})`,
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  </div>
);

/* ─── Grid Background ─── */
export const GridBackground: React.FC<{
  opacity?: number;
  gridSize?: number;
  offsetY?: number;
}> = ({ opacity = 0.04, gridSize = 60, offsetY = 0 }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `radial-gradient(circle, rgba(255,255,255,${opacity}) 1px, transparent 1px)`,
      backgroundSize: `${gridSize}px ${gridSize}px`,
      backgroundPosition: `0 ${offsetY}px`,
      pointerEvents: "none",
    }}
  />
);

/* ─── Gradient Text ─── */
export const GradientText: React.FC<{
  children: React.ReactNode;
  gradient: string;
  style?: React.CSSProperties;
}> = ({ children, gradient, style }) => (
  <span
    style={{
      background: gradient,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      ...style,
    }}
  >
    {children}
  </span>
);

/* ─── Noise Overlay (film grain) ─── */
export const NoiseOverlay: React.FC<{ opacity?: number }> = ({
  opacity = 0.015,
}) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      zIndex: 100,
      opacity,
      mixBlendMode: "overlay",
    }}
  >
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <filter id="grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/* ─── Animated Conic Border ─── */
export const AnimatedBorder: React.FC<{
  children: React.ReactNode;
  width: number | string;
  borderWidth?: number;
  borderRadius?: number;
  colors: string[];
  rotationProgress: number;
}> = ({
  children,
  width,
  borderWidth = 1.5,
  borderRadius = 24,
  colors: borderColors,
  rotationProgress,
}) => {
  const angle = rotationProgress * 360;
  const stops = borderColors
    .map(
      (c, i) =>
        `${c} ${(i / borderColors.length) * 100}% ${((i + 1) / borderColors.length) * 100}%`,
    )
    .join(", ");

  return (
    <div
      style={{
        position: "relative",
        width,
        padding: borderWidth,
        borderRadius: borderRadius + borderWidth,
        background: `conic-gradient(from ${angle}deg, ${stops})`,
      }}
    >
      <div
        style={{
          borderRadius,
          background: colors.bg,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
};
