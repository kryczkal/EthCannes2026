import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "Coding accelerated." fades in first
  const line1Opacity = interpolate(frame, [5, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1Y = interpolate(frame, [5, 18], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "Security didn't." slams in after
  const line2Scale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const line2Opacity = interpolate(frame, [40, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent line between
  const lineWidth = spring({
    frame: frame - 30,
    fps,
    config: springs.smooth,
  });

  // Fade out at the end
  const fadeOut = interpolate(frame, [95, 115], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.black,
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      {/* Line 1 */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 56,
          fontWeight: 700,
          color: colors.text,
          opacity: line1Opacity,
          transform: `translateY(${line1Y}px)`,
          letterSpacing: "-0.02em",
        }}
      >
        Coding accelerated.
      </div>

      {/* Accent line */}
      <div
        style={{
          width: interpolate(lineWidth, [0, 1], [0, 60]),
          height: 2,
          backgroundColor: colors.danger,
          marginTop: 20,
          marginBottom: 20,
        }}
      />

      {/* Line 2 */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 56,
          fontWeight: 700,
          color: colors.danger,
          transform: `scale(${line2Scale})`,
          opacity: line2Opacity,
          letterSpacing: "-0.02em",
          textShadow: "0 0 40px rgba(248, 113, 113, 0.3)",
        }}
      >
        Security didn't.
      </div>
    </AbsoluteFill>
  );
};
