import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, springs } from "../lib/theme";

export const MoneyLost: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Number slams in red with bouncy spring
  const numberScale = spring({
    frame,
    fps,
    config: springs.bouncy,
  });

  const numberOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Subtitle fades in
  const subtitleOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleY = interpolate(frame, [15, 30], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Red glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.3, 0.6],
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.black,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Red glow behind number */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(248, 113, 113, ${glowIntensity}), transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      {/* Main number */}
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 200,
          fontWeight: 700,
          color: colors.danger,
          transform: `scale(${numberScale})`,
          opacity: numberOpacity,
          letterSpacing: "-0.02em",
          textShadow: `0 0 80px rgba(248, 113, 113, 0.5)`,
        }}
      >
        $60B
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 28,
          color: colors.textMuted,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          marginTop: 16,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        in damage
      </div>
    </AbsoluteFill>
  );
};
