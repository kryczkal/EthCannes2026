import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fonts, springs } from "../lib/theme";

export const MoneyLost: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Count-up from 0 to 60
  const countValue = Math.floor(
    interpolate(frame, [3, 25], [0, 60], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Number slams in
  const numberScale = spring({
    frame,
    fps,
    config: springs.bouncy,
  });
  const numberOpacity = interpolate(frame, [0, 5], [0, 1], {
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

  // Accent line
  const lineWidth = spring({
    frame: frame - 15,
    fps,
    config: springs.smooth,
  });

  // Slow zoom on background video (Ken Burns)
  const zoom = interpolate(frame, [0, 90], [1.05, 1.12], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video — dimmed, desaturated, slow zoom */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("bg-money.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.7) saturate(0.85) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Dark radial overlay for text readability */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.25) 100%)",
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* $60B — pure white, layered shadows */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 260,
              fontWeight: 900,
              lineHeight: 0.9,
              color: "#ffffff",
              transform: `scale(${numberScale})`,
              opacity: numberOpacity,
              letterSpacing: "-0.04em",
              textShadow:
                "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)",
            }}
          >
            ${countValue}B
          </div>

          {/* Accent line */}
          <div
            style={{
              width: interpolate(lineWidth, [0, 1], [0, 120]),
              height: 2,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              marginTop: 20,
              marginBottom: 16,
              borderRadius: 1,
            }}
          />

          {/* "in damage" — light, wide-spaced, uppercase whisper */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 38,
              fontWeight: 400,
              color: "rgba(255,255,255,0.6)",
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              textShadow: "0 2px 15px rgba(0,0,0,0.8)",
            }}
          >
            in damage
          </div>
        </div>
      </AbsoluteFill>

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
