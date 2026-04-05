import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

export const StatsTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "8" slams in
  const numberScale = spring({
    frame,
    fps,
    config: springs.bouncy,
  });

  const numberOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // "out of 10" fades in
  const outOfOpacity = interpolate(frame, [12, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "were preventable" types in
  const preventableOpacity = interpolate(frame, [28, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const preventableY = interpolate(frame, [28, 40], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "with a simple post-install script check" — the kicker
  const kickerOpacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent line
  const lineWidth = spring({
    frame: frame - 5,
    fps,
    config: springs.smooth,
  });

  // Slow zoom
  const zoom = interpolate(frame, [0, 140], [1, 1.03], {
    extrapolateRight: "clamp",
  });

  // Vignette
  const vignetteOpacity = interpolate(frame, [0, 30], [0, 0.6], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.black }}>
      {/* Radial vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          opacity: vignetteOpacity,
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${zoom})`,
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            width: interpolate(lineWidth, [0, 1], [0, 80]),
            height: 1,
            backgroundColor: colors.accent,
            opacity: 0.6,
            marginBottom: 30,
          }}
        />

        {/* "8 out of 10" */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 220,
              fontWeight: 700,
              color: colors.danger,
              transform: `scale(${numberScale})`,
              opacity: numberOpacity,
              lineHeight: 1,
              textShadow: "0 0 80px rgba(248, 113, 113, 0.4)",
            }}
          >
            8
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 48,
              color: colors.textDim,
              opacity: outOfOpacity,
              lineHeight: 1,
            }}
          >
            out of 10
          </span>
        </div>

        {/* "were preventable" */}
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 36,
            color: colors.text,
            opacity: preventableOpacity,
            transform: `translateY(${preventableY}px)`,
            marginTop: 16,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          were preventable
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            width: interpolate(lineWidth, [0, 1], [0, 80]),
            height: 1,
            backgroundColor: colors.accent,
            opacity: 0.6,
            marginTop: 28,
            marginBottom: 20,
          }}
        />

        {/* The kicker */}
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            color: colors.accent,
            opacity: kickerOpacity,
            letterSpacing: "0.06em",
          }}
        >
          with a simple post-install script check
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
