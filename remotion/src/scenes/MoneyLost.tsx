import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs, gradients } from "../lib/theme";
import { GlassCard, GridBackground, GradientText } from "../lib/visuals";

// Floating ember particles
const EMBERS = Array.from({ length: 10 }, (_, i) => ({
  x: 30 + ((i * 137) % 100) * 0.6 + 20,
  startFrame: i * 6,
  size: 3 + (i % 3) * 2,
  drift: (i % 2 === 0 ? -1 : 1) * (10 + (i % 5) * 4),
}));

export const MoneyLost: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Count-up from 0 to 60
  const countValue = Math.floor(
    interpolate(frame, [0, 25], [0, 60], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Card entrance
  const cardScale = spring({
    frame,
    fps,
    config: springs.bouncy,
  });

  const cardOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Subtitle fades in
  const subtitleOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subtitleY = interpolate(frame, [18, 30], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Separator line
  const lineWidth = spring({
    frame: frame - 20,
    fps,
    config: springs.smooth,
  });

  // Red glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.2, 0.45],
  );

  return (
    <AbsoluteFill
      style={{
        background: gradients.bgRadial,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GridBackground opacity={0.04} />

      {/* Floating embers */}
      {EMBERS.map((ember, i) => {
        const emberOpacity = interpolate(
          frame,
          [ember.startFrame, ember.startFrame + 20, ember.startFrame + 55],
          [0, 0.35, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const emberY = interpolate(frame, [0, 90], [0, -50], {
          extrapolateRight: "clamp",
        });
        const emberX = Math.sin((frame + i * 20) * 0.05) * ember.drift;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${ember.x}%`,
              top: "55%",
              width: ember.size,
              height: ember.size,
              borderRadius: "50%",
              backgroundColor: colors.danger,
              opacity: emberOpacity,
              transform: `translate(${emberX}px, ${emberY}px)`,
              boxShadow: `0 0 ${ember.size * 3}px ${colors.danger}`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Glass stat card */}
      <div
        style={{
          transform: `scale(${cardScale})`,
          opacity: cardOpacity,
        }}
      >
        <GlassCard
          width={700}
          padding="60px 80px"
          glowColor={`rgba(248, 113, 113, ${glowIntensity})`}
          borderOpacity={0.1}
        >
          <div style={{ textAlign: "center" }}>
            {/* Main number with gradient */}
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 200,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              <GradientText
                gradient={gradients.dangerText}
                style={{
                  filter:
                    "drop-shadow(0 0 60px rgba(248, 113, 113, 0.5))",
                }}
              >
                ${countValue}B
              </GradientText>
            </div>

            {/* Separator line */}
            <div
              style={{
                width: interpolate(lineWidth, [0, 1], [0, 120]),
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(248, 113, 113, 0.4), transparent)",
                margin: "20px auto 16px",
              }}
            />

            {/* Subtitle */}
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 28,
                color: colors.textDim,
                opacity: subtitleOpacity,
                transform: `translateY(${subtitleY}px)`,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              in damage
            </div>
          </div>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};
