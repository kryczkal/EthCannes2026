import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

const FEATURES = [
  "AI-Powered Audit",
  "On-Chain Verdicts",
  "IPFS-Verified Installs",
];

export const ClosingCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo scale
  const logoScale = spring({
    frame,
    fps,
    config: springs.smooth,
  });

  // Title fade
  const titleOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Feature pills stagger
  const getFeatureProgress = (index: number) => {
    return spring({
      frame: frame - (20 + index * 8),
      fps,
      config: springs.snappy,
    });
  };

  // Bottom text
  const bottomOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle gradient animation
  const gradientAngle = interpolate(frame, [0, 90], [140, 160]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, ${colors.bg} 0%, ${colors.bgSecondary} 50%, ${colors.bg} 100%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Subtle gold accent glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          width: 600,
          height: 300,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(201, 168, 76, 0.08), transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      {/* Logo */}
      <Img
        src={staticFile("logo.svg")}
        style={{
          width: 80,
          height: 80,
          transform: `scale(${logoScale})`,
        }}
      />

      {/* Brand name */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 64,
          fontWeight: 900,
          color: colors.text,
          opacity: titleOpacity,
          marginTop: 20,
          letterSpacing: "-0.03em",
        }}
      >
        npm
        <span style={{ color: colors.accent }}>guard</span>
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 36,
        }}
      >
        {FEATURES.map((feature, i) => {
          const progress = getFeatureProgress(i);
          return (
            <div
              key={feature}
              style={{
                fontFamily: fonts.mono,
                fontSize: 15,
                color: colors.accent,
                border: `1px solid ${colors.accent}`,
                backgroundColor: "rgba(201, 168, 76, 0.06)",
                padding: "10px 22px",
                borderRadius: 24,
                transform: `scale(${progress})`,
                opacity: interpolate(progress, [0, 0.5, 1], [0, 0.5, 1]),
                letterSpacing: "0.02em",
              }}
            >
              {feature}
            </div>
          );
        })}
      </div>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          opacity: bottomOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 14,
            color: colors.textMuted,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          ETH Cannes 2026
        </div>
      </div>
    </AbsoluteFill>
  );
};
