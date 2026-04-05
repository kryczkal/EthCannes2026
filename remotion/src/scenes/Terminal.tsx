import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fonts } from "../lib/theme";

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  useVideoConfig();

  // ── "Coding accelerated." — FAST entrance (frames 3–10) ──
  // Snappy. Rushes in from the left. Feels like speed.
  const line1Opacity = interpolate(frame, [3, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1X = interpolate(frame, [3, 10], [-60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.exp),
  });
  // Line 1 fades out before line 2
  const line1FadeOut = interpolate(frame, [35, 42], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  // Background dims dramatically between the two lines
  const bgDim = interpolate(frame, [35, 50], [0.3, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── "Security" — SLOW, deliberate (frames 48–68) ──
  const word1Opacity = interpolate(frame, [48, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const word1Blur = interpolate(frame, [48, 65], [6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── "didn't." — even slower, arrives after Security (frames 62–82) ──
  const word2Opacity = interpolate(frame, [62, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const word2Blur = interpolate(frame, [62, 78], [6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Red glow builds slowly behind "Security didn't."
  const redGlow = interpolate(frame, [48, 80], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade out at the end
  const fadeOut = interpolate(frame, [95, 115], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  // Slow zoom on background
  const zoom = interpolate(frame, [0, 115], [1.05, 1.1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut }}>
      {/* Background video — dims dramatically between beats */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("bg-terminal.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `brightness(${bgDim}) saturate(0.5) contrast(1.1)`,
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Red glow that builds behind line 2 */}
      <div
        style={{
          position: "absolute",
          top: "55%",
          left: "50%",
          width: 600,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(248, 113, 113, ${redGlow}), transparent 70%)`,
          transform: "translate(-50%, -50%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* ── Line 1: "Coding accelerated." — fast, from left ── */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: line1Opacity * line1FadeOut,
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 82,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            transform: `translateX(${line1X}px)`,
            textShadow:
              "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
          }}
        >
          Coding accelerated.
        </div>
      </AbsoluteFill>

      {/* ── Line 2: "Security didn't." — slow, word by word ── */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
          }}
        >
          {/* "Security" */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 82,
              fontWeight: 700,
              color: "#ff4444",
              opacity: word1Opacity,
              filter: `blur(${word1Blur}px)`,
              letterSpacing: "-0.02em",
              textShadow:
                "0 0 40px rgba(255, 68, 68, 0.3), 0 4px 20px rgba(0,0,0,0.6)",
            }}
          >
            Security
          </div>
          {/* "didn't." — arrives later, heavier */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 82,
              fontWeight: 900,
              color: "#ff4444",
              opacity: word2Opacity,
              filter: `blur(${word2Blur}px)`,
              letterSpacing: "-0.02em",
              textShadow:
                "0 0 40px rgba(255, 68, 68, 0.3), 0 4px 20px rgba(0,0,0,0.6)",
            }}
          >
            didn't.
          </div>
        </div>
      </AbsoluteFill>

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
