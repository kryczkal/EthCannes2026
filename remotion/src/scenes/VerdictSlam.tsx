import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs, gradients } from "../lib/theme";
import {
  GlassCard,
  GridBackground,
  GradientText,
  AnimatedBorder,
} from "../lib/visuals";

const CAPABILITIES = [
  { label: "network", dot: "#f87171" },
  { label: "filesystem", dot: "#fbbf24" },
  { label: "process_spawn", dot: "#fb923c" },
  { label: "env_vars", dot: "#f87171" },
];

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
    [0.15, 0.4],
  );

  // Score count-up
  const scoreValue = Math.floor(
    interpolate(frame, [15, 30], [0, 92], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const scoreOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Progress bar fill
  const progressFill = interpolate(frame, [15, 30], [0, 92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Capability tags pop in with stagger
  const getTagProgress = (index: number) => {
    const delay = 25 + index * 6;
    return spring({
      frame: frame - delay,
      fps,
      config: springs.snappy,
    });
  };

  // Screen shake on slam (extended, with Y axis)
  const shakeX =
    frame < 12
      ? Math.sin(frame * 5) *
        interpolate(frame, [0, 12], [8, 0], { extrapolateRight: "clamp" })
      : 0;
  const shakeY =
    frame < 12
      ? Math.cos(frame * 4) *
        interpolate(frame, [0, 12], [4, 0], { extrapolateRight: "clamp" })
      : 0;

  // Animated border rotation
  const borderRotation = interpolate(frame, [0, 195], [0, 2], {
    extrapolateRight: "clamp",
  });

  // Card entrance
  const cardScale = spring({
    frame: frame - 2,
    fps,
    config: { damping: 20, stiffness: 150 },
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 30%, rgba(248, 113, 113, 0.08) 0%, ${colors.bg} 60%, #000 100%)`,
      }}
    >
      <GridBackground opacity={0.03} />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translate(${shakeX}px, ${shakeY}px)`,
        }}
      >
        <div style={{ transform: `scale(${cardScale})` }}>
          <AnimatedBorder
            width={800}
            borderWidth={1.5}
            borderRadius={20}
            colors={[colors.danger, "#ef4444", "transparent", colors.danger]}
            rotationProgress={borderRotation}
          >
            <GlassCard
              padding="70px 100px"
              glowColor={`rgba(248, 113, 113, ${glowIntensity})`}
              borderOpacity={0}
              borderRadius={20}
            >
              <div style={{ textAlign: "center", position: "relative" }}>
                {/* Ghost echo behind CRITICAL */}
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 0,
                    transform: "translateX(-50%) scale(1.15)",
                    fontFamily: fonts.mono,
                    fontSize: 140,
                    fontWeight: 700,
                    color: colors.danger,
                    opacity: 0.05,
                    filter: "blur(10px)",
                    letterSpacing: "0.05em",
                    lineHeight: 1,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  CRITICAL
                </div>

                {/* CRITICAL text */}
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 140,
                    fontWeight: 700,
                    lineHeight: 1,
                    transform: `scale(${textScale})`,
                    opacity: textOpacity,
                    filter: `blur(${textBlur}px)`,
                    letterSpacing: "0.05em",
                  }}
                >
                  <GradientText
                    gradient={gradients.dangerText}
                    style={{
                      filter:
                        "drop-shadow(0 0 80px rgba(248, 113, 113, 0.6)) drop-shadow(0 0 160px rgba(248, 113, 113, 0.2))",
                    }}
                  >
                    CRITICAL
                  </GradientText>
                </div>

                {/* Score pill */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 24,
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "rgba(248, 113, 113, 0.08)",
                    border: "1px solid rgba(248, 113, 113, 0.2)",
                    opacity: scoreOpacity,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 22,
                      color: colors.textDim,
                    }}
                  >
                    Risk Score
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 28,
                      fontWeight: 700,
                      color: colors.danger,
                    }}
                  >
                    {scoreValue}/100
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    width: 200,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(255,255,255,0.1)",
                    margin: "12px auto 0",
                    opacity: scoreOpacity,
                  }}
                >
                  <div
                    style={{
                      width: `${progressFill}%`,
                      height: "100%",
                      borderRadius: 2,
                      backgroundColor: colors.danger,
                      boxShadow: `0 0 8px ${colors.danger}`,
                    }}
                  />
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
                        key={cap.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontFamily: fonts.mono,
                          fontSize: 16,
                          color: colors.danger,
                          background: "rgba(248, 113, 113, 0.06)",
                          backdropFilter: "blur(20px)",
                          border: "1px solid rgba(248, 113, 113, 0.15)",
                          padding: "8px 20px",
                          borderRadius: 20,
                          transform: `scale(${progress})`,
                          opacity: interpolate(
                            progress,
                            [0, 0.5, 1],
                            [0, 0.5, 1],
                          ),
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          boxShadow: "0 0 20px rgba(248, 113, 113, 0.08)",
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: cap.dot,
                            boxShadow: `0 0 6px ${cap.dot}`,
                          }}
                        />
                        {cap.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </AnimatedBorder>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
