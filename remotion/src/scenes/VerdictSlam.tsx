import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

const CAPABILITIES = ["network", "filesystem", "process_spawn", "env_vars"];

export const VerdictSlam: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // CRITICAL text slam with blur-to-sharp
  const textScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 300 },
  });

  const textBlur = interpolate(frame, [0, 12], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Red glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.12),
    [-1, 1],
    [0.2, 0.5],
  );

  // Score reveals
  const scoreOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Capability tags pop in with stagger
  const getTagProgress = (index: number) => {
    const delay = 20 + index * 6;
    return spring({
      frame: frame - delay,
      fps,
      config: springs.snappy,
    });
  };

  // Screen shake on slam
  const shakeX =
    frame < 8
      ? Math.sin(frame * 5) *
        interpolate(frame, [0, 8], [6, 0], { extrapolateRight: "clamp" })
      : 0;

  // Border top line extending
  const borderWidth = spring({
    frame: frame - 3,
    fps,
    config: springs.smooth,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Red glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          width: 800,
          height: 400,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(248, 113, 113, ${glowIntensity}), transparent 70%)`,
          filter: "blur(80px)",
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateX(${shakeX}px)`,
        }}
      >
        {/* Verdict card */}
        <div
          style={{
            textAlign: "center",
            padding: "60px 100px",
            position: "relative",
          }}
        >
          {/* Top border line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              height: 3,
              width: interpolate(borderWidth, [0, 1], [0, 600]),
              transform: "translateX(-50%)",
              backgroundColor: colors.danger,
              borderRadius: 2,
            }}
          />

          {/* CRITICAL text */}
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 140,
              fontWeight: 700,
              color: colors.danger,
              transform: `scale(${textScale})`,
              opacity: textOpacity,
              filter: `blur(${textBlur}px)`,
              letterSpacing: "0.05em",
              textShadow: `0 0 60px rgba(248, 113, 113, 0.4)`,
              lineHeight: 1,
            }}
          >
            CRITICAL
          </div>

          {/* Score */}
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 28,
              color: colors.textDim,
              opacity: scoreOpacity,
              marginTop: 20,
            }}
          >
            Risk Score:{" "}
            <span style={{ color: colors.danger, fontWeight: 700 }}>
              92/100
            </span>
          </div>

          {/* Capability tags */}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              marginTop: 28,
              flexWrap: "wrap",
            }}
          >
            {CAPABILITIES.map((cap, i) => {
              const progress = getTagProgress(i);
              return (
                <div
                  key={cap}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 14,
                    color: colors.danger,
                    border: `1px solid ${colors.danger}`,
                    backgroundColor: colors.dangerBg,
                    padding: "6px 16px",
                    borderRadius: 20,
                    transform: `scale(${progress})`,
                    opacity: interpolate(progress, [0, 0.5, 1], [0, 0.5, 1]),
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {cap}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
