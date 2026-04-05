import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fonts } from "../lib/theme";

// Proof publishing steps — reflects real system: IPFS + ENS on-chain
const PROOF_STEPS: {
  text: string;
  frame: number;
  color: string;
  size?: number;
  weight?: number;
  indent?: number;
  isTitle?: boolean;
  isResult?: boolean;
}[] = [
  // Step 1: Pin to IPFS
  { text: "1. Pin audit report to IPFS", frame: 0, color: "rgba(255,255,255,0.45)", size: 28, weight: 400, isTitle: true },
  { text: "report_cid → bafkreig7h4x2e9...q4mq", frame: 12, color: "#60a5fa", size: 38 },
  { text: "source_cid → bafybeiw3k8f1a2...x9vn", frame: 24, color: "#60a5fa", size: 38 },

  // Step 2: Write to ENS
  { text: "2. Publish verdict on-chain", frame: 45, color: "rgba(255,255,255,0.45)", size: 28, weight: 400, isTitle: true },
  { text: "axios.npmguard.eth", frame: 57, color: "#c9a84c", size: 42, weight: 700 },
  { text: "npmguard.verdict   → safe", frame: 70, color: "rgba(255,255,255,0.9)", size: 34, indent: 1 },
  { text: "npmguard.score     → 92", frame: 80, color: "rgba(255,255,255,0.9)", size: 34, indent: 1 },
  { text: "npmguard.capabilities → network", frame: 90, color: "rgba(255,255,255,0.9)", size: 34, indent: 1 },

  // Step 3: Verified
  { text: "3. Immutable. Tamper-proof. Verifiable.", frame: 115, color: "rgba(255,255,255,0.45)", size: 28, weight: 400, isTitle: true },
  { text: "✓ On-chain + IPFS verified", frame: 135, color: "#4ade80", size: 52, weight: 700, isResult: true },
];

export const VerdictSlam: React.FC = () => {
  const frame = useCurrentFrame();
  useVideoConfig();

  // Slow zoom on background
  const zoom = interpolate(frame, [0, 195], [1.05, 1.15], {
    extrapolateRight: "clamp",
  });

  // Title animation
  const titleOp = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 12], [25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background video */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video
          src={staticFile("feat-chain.mp4")}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.45) saturate(0.7) contrast(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* Content */}
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
            alignItems: "flex-start",
            maxWidth: 1400,
            width: "100%",
          }}
        >
          {/* Main title */}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 82,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              textShadow:
                "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.35)",
              opacity: titleOp,
              transform: `translateY(${titleY}px)`,
              marginBottom: 40,
              alignSelf: "center",
            }}
          >
            Verifiable Proofs
          </div>

          {/* Proof steps */}
          {PROOF_STEPS.map((step, i) => {
            if (frame < step.frame) return null;
            const localF = frame - step.frame;
            const lineOp = interpolate(localF, [0, 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const lineY = interpolate(localF, [0, 10], [20, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.quad),
            });
            const lineBlur = interpolate(localF, [0, 8], [6, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            const isResult = step.isResult;

            return (
              <div
                key={i}
                style={{
                  fontFamily: step.isTitle ? fonts.heading : fonts.mono,
                  fontSize: step.size || 38,
                  fontWeight: step.weight || (isResult ? 700 : 400),
                  color: step.color,
                  opacity: lineOp,
                  transform: `translateY(${lineY}px)`,
                  filter: `blur(${lineBlur}px)`,
                  textShadow: isResult
                    ? "0 0 40px rgba(74, 222, 128, 0.5), 0 2px 15px rgba(0,0,0,0.7)"
                    : "0 2px 10px rgba(0,0,0,0.6)",
                  letterSpacing: step.isTitle ? "0.08em" : "0.02em",
                  textTransform: step.isTitle ? "uppercase" : undefined,
                  marginLeft: step.indent ? 48 : 0,
                  marginBottom: step.isTitle ? 8 : 14,
                  marginTop: step.isTitle && i > 0 ? 12 : 0,
                }}
              >
                {step.text}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Green flash on valid */}
      <AbsoluteFill
        style={{
          backgroundColor: "#4ade80",
          opacity: interpolate(frame, [148, 152, 160], [0, 0.1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          pointerEvents: "none",
        }}
      />

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
