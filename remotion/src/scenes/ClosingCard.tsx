import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
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

  // Slow zoom
  const zoom = interpolate(frame, [0, 150], [1.05, 1.12], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("bg-closing.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.25) saturate(0.5) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        {/* Logo */}
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 90,
            height: 90,
            transform: `scale(${logoScale})`,
            filter: "drop-shadow(0 0 30px rgba(201, 168, 76, 0.3))",
          }}
        />

        {/* Brand name */}
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            fontWeight: 900,
            opacity: titleOpacity,
            marginTop: 20,
            letterSpacing: "-0.03em",
            textShadow:
              "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
          }}
        >
          <span style={{ color: "#ffffff" }}>npm</span>
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
                  color: "rgba(255,255,255,0.8)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(20px)",
                  padding: "10px 22px",
                  borderRadius: 24,
                  transform: `scale(${progress})`,
                  opacity: interpolate(
                    progress,
                    [0, 0.5, 1],
                    [0, 0.5, 1],
                  ),
                  letterSpacing: "0.02em",
                }}
              >
                {feature}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: bottomOpacity,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 14,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          ETH Cannes 2026
        </div>
      </div>

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
