import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fonts, springs } from "../lib/theme";

export const StatsTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── BEAT 1: "8 out of 10 were preventable" (frames 0–75) ──

  // Fade out beat 1 to make room for beat 2
  const beat1Opacity = interpolate(frame, [65, 78], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

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
  const outOfY = interpolate(frame, [12, 22], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "were preventable"
  const preventableOpacity = interpolate(frame, [28, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const preventableY = interpolate(frame, [28, 40], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent line
  const lineWidth = spring({
    frame: frame - 25,
    fps,
    config: springs.smooth,
  });

  // ── BEAT 2: "with a simple post-install script check" (frames 78–140) ──
  // Line-by-line reveal with smooth ease + blur-to-sharp (focus pull)

  // Line 1: "With a simple"
  const line1Op = interpolate(frame, [80, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const line1Y = interpolate(frame, [80, 92], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const line1Blur = interpolate(frame, [80, 90], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Line 2: "post-install script check."
  const line2Op = interpolate(frame, [94, 106], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const line2Y = interpolate(frame, [94, 106], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const line2Blur = interpolate(frame, [94, 104], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow zoom on background
  const zoom = interpolate(frame, [0, 140], [1.05, 1.15], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("bg-stats.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.7) saturate(0.85) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* ── BEAT 1: 8 out of 10 were preventable ── */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: beat1Opacity,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* "8 out of 10" */}
          <div
            style={{ display: "flex", alignItems: "baseline", gap: 20 }}
          >
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 280,
                fontWeight: 900,
                lineHeight: 0.85,
                color: "#ffffff",
                transform: `scale(${numberScale})`,
                opacity: numberOpacity,
                letterSpacing: "-0.04em",
                textShadow:
                  "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)",
              }}
            >
              8
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                opacity: outOfOpacity,
                transform: `translateY(${outOfY}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 76,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.7)",
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                  textShadow: "0 4px 20px rgba(0,0,0,0.8)",
                }}
              >
                out of
              </span>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 120,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 0.9,
                  letterSpacing: "-0.04em",
                  textShadow: "0 4px 20px rgba(0,0,0,0.8)",
                }}
              >
                10
              </span>
            </div>
          </div>

          {/* Accent line */}
          <div
            style={{
              width: interpolate(lineWidth, [0, 1], [0, 160]),
              height: 2,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
              marginTop: 20,
              marginBottom: 20,
              borderRadius: 1,
            }}
          />

          {/* "were preventable" */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 76,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              opacity: preventableOpacity,
              transform: `translateY(${preventableY}px)`,
              letterSpacing: "-0.02em",
              textShadow: "0 4px 20px rgba(0,0,0,0.8)",
            }}
          >
            were preventable
          </div>
        </div>
      </AbsoluteFill>

      {/* ── BEAT 2: line-by-line reveal with focus pull ── */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Line 1 */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 86,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              textShadow:
                "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
              opacity: line1Op,
              transform: `translateY(${line1Y}px)`,
              filter: `blur(${line1Blur}px)`,
            }}
          >
            With a simple
          </div>
          {/* Line 2 */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 86,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              textShadow:
                "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
              opacity: line2Op,
              transform: `translateY(${line2Y}px)`,
              filter: `blur(${line2Blur}px)`,
            }}
          >
            post-install script check.
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
