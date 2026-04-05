import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { colors, fonts } from "../lib/theme";

export const ClosingCard: React.FC = () => {
  const frame = useCurrentFrame();
  useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bottomOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow zoom on background
  const bgZoom = interpolate(frame, [0, 150], [1.05, 1.12], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${bgZoom})` }}>
        <Video
          src={staticFile("bg-closing.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.6) saturate(0.7) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* Logo + brand */}
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 100,
            fontWeight: 900,
            opacity: titleOpacity,
            marginTop: 24,
            letterSpacing: "-0.03em",
            textShadow:
              "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.35)",
          }}
        >
          <span style={{ color: "#ffffff" }}>npm</span>
          <span style={{ color: colors.accent }}>guard</span>
        </div>
      </AbsoluteFill>

      {/* ETH Cannes */}
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
            fontSize: 22,
            color: "rgba(255,255,255,0.45)",
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
