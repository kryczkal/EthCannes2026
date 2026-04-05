import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { colors, fonts } from "../lib/theme";

const COMMAND = "npmguard";
const CHARS_PER_FRAME = 0.45;

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  useVideoConfig();

  // Terminal fade in
  const termOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typing animation
  const typedChars = Math.min(
    Math.floor(Math.max(0, frame - 10) * CHARS_PER_FRAME),
    COMMAND.length,
  );
  const typedText = COMMAND.slice(0, typedChars);
  const doneTyping = typedChars >= COMMAND.length;
  const showCursor = Math.floor(frame / 8) % 2 === 0;

  // Subtitle fades in after typing
  const subtitleOpacity = interpolate(frame, [38, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const subtitleY = interpolate(frame, [38, 55], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Cursor glow
  const cursorGlow = doneTyping ? 0.05 : 0.12;

  return (
    <AbsoluteFill style={{ backgroundColor: "#060504" }}>
      {/* Subtle center glow */}
      <div
        style={{
          position: "absolute",
          top: "45%",
          left: "50%",
          width: 800,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(201, 168, 76, ${cursorGlow}), transparent 70%)`,
          transform: "translate(-50%, -50%)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      {/* Terminal typewriter */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: termOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Prompt + typed text */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 20,
                color: "rgba(255,255,255,0.3)",
                marginRight: 14,
              }}
            >
              $
            </span>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 100,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              <span style={{ color: "#ffffff" }}>
                {typedText.slice(0, 3)}
              </span>
              <span style={{ color: colors.accent }}>
                {typedText.slice(3)}
              </span>
            </span>
            {/* Blinking cursor */}
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 100,
                fontWeight: 400,
                color: colors.accent,
                opacity: showCursor ? 0.8 : 0,
                marginLeft: 2,
              }}
            >
              _
            </span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 40,
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textShadow: "0 2px 15px rgba(0,0,0,0.5)",
            }}
          >
            pentests every package with AI
          </div>
        </div>
      </AbsoluteFill>

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
