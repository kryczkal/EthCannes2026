import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fonts, springs } from "../lib/theme";

const CAPABILITIES = [
  { label: "network", dot: "#f87171" },
  { label: "filesystem", dot: "#fbbf24" },
  { label: "process_spawn", dot: "#fb923c" },
  { label: "env_vars", dot: "#f87171" },
];

// Proof equations — beat 2
const PROOF_LINES = [
  { text: "H(pkg) = SHA256(audit_result)", delay: 0 },
  { text: "π ← zkProve(statement, witness)", delay: 10 },
  { text: "Verify(vk, π) → ✓ VALID", delay: 20, isResult: true },
];

const BEAT_SWITCH = 85;

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

  // Capability tags
  const getTagProgress = (index: number) => {
    const delay = 25 + index * 6;
    return spring({
      frame: frame - delay,
      fps,
      config: springs.snappy,
    });
  };

  // Screen shake on slam
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

  // Slow zoom on background
  const zoom = interpolate(frame, [0, 195], [1.05, 1.15], {
    extrapolateRight: "clamp",
  });

  // ── Beat transition ──
  const inBeat1 = frame < BEAT_SWITCH;
  const beat2Frame = frame - BEAT_SWITCH;

  const beat1Opacity = interpolate(frame, [BEAT_SWITCH - 15, BEAT_SWITCH], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const beat2Opacity = !inBeat1
    ? interpolate(beat2Frame, [0, 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("bg-verdict.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.65) saturate(0.8) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.25) 100%)",
        }}
      />

      {/* ═══ BEAT 1: CRITICAL verdict ═══ */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translate(${shakeX}px, ${shakeY}px)`,
          opacity: beat1Opacity,
        }}
      >
        <div style={{ textAlign: "center" }}>
          {/* CRITICAL — solid red, no gradient */}
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 170,
              fontWeight: 700,
              lineHeight: 1,
              color: "#ff4444",
              transform: `scale(${textScale})`,
              opacity: textOpacity,
              filter: `blur(${textBlur}px)`,
              letterSpacing: "0.05em",
              textShadow:
                "0 0 60px rgba(255, 68, 68, 0.4), 0 0 120px rgba(255, 68, 68, 0.15), 0 4px 20px rgba(0,0,0,0.6)",
            }}
          >
            CRITICAL
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
              background: "rgba(255, 68, 68, 0.08)",
              border: "1px solid rgba(255, 68, 68, 0.2)",
              opacity: scoreOpacity,
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 28,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Risk Score
            </span>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 36,
                fontWeight: 700,
                color: "#ff4444",
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
                backgroundColor: "#ff4444",
                boxShadow: "0 0 8px rgba(255, 68, 68, 0.5)",
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
                    fontSize: 20,
                    color: "rgba(255,255,255,0.7)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    padding: "8px 18px",
                    borderRadius: 20,
                    transform: `scale(${progress})`,
                    opacity: interpolate(
                      progress,
                      [0, 0.5, 1],
                      [0, 0.5, 1],
                    ),
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
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
      </AbsoluteFill>

      {/* ═══ BEAT 2: Verifiable Proofs ═══ */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: beat2Opacity,
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
          {/* Section title */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 82,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              textShadow:
                "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.35)",
              opacity: interpolate(beat2Frame, [0, 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(beat2Frame, [0, 12], [20, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.quad),
              })}px)`,
            }}
          >
            Verifiable Proofs
          </div>

          {/* Accent line */}
          <div
            style={{
              width: interpolate(beat2Frame, [8, 20], [0, 120], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              height: 3,
              backgroundColor: "#4ade80",
              borderRadius: 2,
              boxShadow: "0 0 20px rgba(74, 222, 128, 0.3)",
            }}
          />

          {/* Proof equations */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 28,
              marginTop: 16,
            }}
          >
            {PROOF_LINES.map((line, i) => {
              const localF = beat2Frame - 15 - line.delay;
              const lineOp = interpolate(localF, [0, 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const lineY = interpolate(localF, [0, 10], [25, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.quad),
              });
              const lineBlur = interpolate(localF, [0, 8], [8, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: line.isResult ? 52 : 44,
                    fontWeight: line.isResult ? 700 : 400,
                    color: line.isResult
                      ? "#4ade80"
                      : "rgba(255,255,255,0.9)",
                    opacity: lineOp,
                    transform: `translateY(${lineY}px)`,
                    filter: `blur(${lineBlur}px)`,
                    textShadow: line.isResult
                      ? "0 0 40px rgba(74, 222, 128, 0.5), 0 2px 15px rgba(0,0,0,0.7)"
                      : "0 2px 15px rgba(0,0,0,0.7)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {line.text}
                </div>
              );
            })}
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
