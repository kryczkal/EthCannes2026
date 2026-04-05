import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs, gradients } from "../lib/theme";
import { GlassCard, GridBackground, GradientText } from "../lib/visuals";

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

  // Underline for "were preventable"
  const underlineWidth = spring({
    frame: frame - 35,
    fps,
    config: springs.smooth,
  });

  // Kicker line
  const kickerOpacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const kickerY = interpolate(frame, [55, 70], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Card entrance
  const cardScale = spring({
    frame,
    fps,
    config: { damping: 30, stiffness: 120 },
  });
  const cardOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Slow zoom
  const zoom = interpolate(frame, [0, 140], [1, 1.02], {
    extrapolateRight: "clamp",
  });

  // Circle ring behind the "8"
  const ringOpacity = interpolate(frame, [3, 15], [0, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringScale = spring({
    frame: frame - 2,
    fps,
    config: { damping: 25, stiffness: 100 },
  });

  // Corner accent marks
  const cornerProgress = spring({
    frame: frame - 10,
    fps,
    config: springs.smooth,
  });
  const cornerOpacity = interpolate(cornerProgress, [0, 1], [0, 0.4]);
  const cornerSize = interpolate(cornerProgress, [0, 1], [0, 20]);

  // Grid parallax drift
  const gridOffset = interpolate(frame, [0, 140], [0, -20], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: gradients.bgRadial,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GridBackground opacity={0.04} offsetY={gridOffset} />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${zoom})`,
        }}
      >
        <div
          style={{
            transform: `scale(${cardScale})`,
            opacity: cardOpacity,
            position: "relative",
          }}
        >
          {/* Corner accent marks */}
          {[
            { top: 0, left: 0, bT: "top", bL: "left" },
            { top: 0, right: 0, bT: "top", bL: "right" },
            { bottom: 0, left: 0, bT: "bottom", bL: "left" },
            { bottom: 0, right: 0, bT: "bottom", bL: "right" },
          ].map((pos, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "top" in pos && pos.top === 0 ? 0 : undefined,
                bottom:
                  "bottom" in pos && pos.bottom === 0 ? 0 : undefined,
                left: "left" in pos && pos.left === 0 ? 0 : undefined,
                right: "right" in pos && pos.right === 0 ? 0 : undefined,
                width: cornerSize,
                height: cornerSize,
                opacity: cornerOpacity,
                borderTop:
                  pos.bT === "top"
                    ? `1px solid ${colors.accent}`
                    : "none",
                borderBottom:
                  pos.bT === "bottom"
                    ? `1px solid ${colors.accent}`
                    : "none",
                borderLeft:
                  pos.bL === "left"
                    ? `1px solid ${colors.accent}`
                    : "none",
                borderRight:
                  pos.bL === "right"
                    ? `1px solid ${colors.accent}`
                    : "none",
                pointerEvents: "none",
              }}
            />
          ))}

          <GlassCard
            width={900}
            padding="50px 80px"
            glowColor="rgba(248, 113, 113, 0.15)"
            borderOpacity={0.08}
          >
            <div
              style={{
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* "8 out of 10" row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 16,
                  position: "relative",
                  justifyContent: "center",
                }}
              >
                {/* Circle ring behind the 8 */}
                <div
                  style={{
                    position: "absolute",
                    width: 200,
                    height: 200,
                    borderRadius: "50%",
                    border: `3px solid rgba(248, 113, 113, ${ringOpacity})`,
                    left: "50%",
                    top: "50%",
                    transform: `translate(-80%, -50%) scale(${ringScale})`,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 220,
                    fontWeight: 700,
                    lineHeight: 1,
                    transform: `scale(${numberScale})`,
                    opacity: numberOpacity,
                  }}
                >
                  <GradientText
                    gradient={gradients.dangerText}
                    style={{
                      filter:
                        "drop-shadow(0 0 80px rgba(248, 113, 113, 0.4))",
                    }}
                  >
                    8
                  </GradientText>
                </div>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 56,
                    color: colors.text,
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
                  fontFamily: fonts.heading,
                  fontSize: 42,
                  fontWeight: 700,
                  color: colors.text,
                  opacity: preventableOpacity,
                  transform: `translateY(${preventableY}px)`,
                  marginTop: 16,
                  letterSpacing: "-0.01em",
                }}
              >
                were preventable
              </div>

              {/* Underline */}
              <div
                style={{
                  width: interpolate(underlineWidth, [0, 1], [0, 260]),
                  height: 2,
                  backgroundColor: colors.accent,
                  opacity: 0.5,
                  marginTop: 8,
                }}
              />

              {/* Kicker in glass chip */}
              <div
                style={{
                  marginTop: 24,
                  opacity: kickerOpacity,
                  transform: `translateY(${kickerY}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 20,
                    color: colors.accent,
                    padding: "12px 24px",
                    borderRadius: 8,
                    background: "rgba(201, 168, 76, 0.06)",
                    border: "1px solid rgba(201, 168, 76, 0.2)",
                    letterSpacing: "0.04em",
                  }}
                >
                  with a simple post-install script check
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
