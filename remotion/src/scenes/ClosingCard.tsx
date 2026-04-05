import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { Video } from "@remotion/media";
import { colors, fonts, springs } from "../lib/theme";

const FEATURES = [
  { label: "AI-Powered Audit", src: "feat-ai.mp4", color: "#60a5fa" },
  { label: "On-Chain Verdicts", src: "feat-chain.mp4", color: "#c9a84c" },
  { label: "IPFS-Verified Installs", src: "feat-ipfs.mp4", color: "#4ade80" },
];

const FEAT_DUR = 40; // frames per feature (~1.3s each)

export const ClosingCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Beat 1: Feature showcase (frames 0–120) ──
  const activeFeat = Math.min(
    Math.floor(frame / FEAT_DUR),
    FEATURES.length - 1,
  );
  const featLocalFrame = frame - activeFeat * FEAT_DUR;
  const inFeatures = frame < FEATURES.length * FEAT_DUR;

  // Feature text animation — smooth fade up with blur
  const featTextOp = inFeatures
    ? interpolate(
        featLocalFrame,
        [0, 8, FEAT_DUR - 6, FEAT_DUR],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;
  const featTextY = inFeatures
    ? interpolate(featLocalFrame, [0, 10], [25, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.quad),
      })
    : 0;
  const featTextBlur = inFeatures
    ? interpolate(featLocalFrame, [0, 8], [6, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Slow zoom on feature video
  const featZoom = inFeatures
    ? interpolate(featLocalFrame, [0, FEAT_DUR], [1.05, 1.12], {
        extrapolateRight: "clamp",
      })
    : 1;

  // ── Beat 2: Logo + brand (frames 120–150) ──
  const logoFrame = frame - FEATURES.length * FEAT_DUR;
  const showLogo = logoFrame >= 0;

  const logoScale = showLogo
    ? spring({ frame: logoFrame, fps, config: springs.smooth })
    : 0;
  const logoOpacity = showLogo
    ? interpolate(logoFrame, [0, 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const titleOpacity = showLogo
    ? interpolate(logoFrame, [8, 18], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const bottomOpacity = showLogo
    ? interpolate(logoFrame, [15, 25], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Logo bg zoom
  const logoBgZoom = showLogo
    ? interpolate(logoFrame, [0, 30], [1.05, 1.1], {
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* ── Feature showcase backgrounds ── */}
      {inFeatures && (
        <>
          <AbsoluteFill style={{ transform: `scale(${featZoom})` }}>
            {FEATURES.map((feat, i) => (
              <AbsoluteFill
                key={feat.label}
                style={{ opacity: i === activeFeat ? 1 : 0 }}
              >
                <Video
                  src={staticFile(feat.src)}
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "brightness(0.3) saturate(0.7) contrast(1.1)",
                  }}
                />
              </AbsoluteFill>
            ))}
          </AbsoluteFill>

          {/* Dark overlay */}
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.6) 100%)",
            }}
          />

          {/* Feature label */}
          <AbsoluteFill
            style={{ justifyContent: "center", alignItems: "center" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 62,
                  fontWeight: 700,
                  color: "#ffffff",
                  opacity: featTextOp,
                  transform: `translateY(${featTextY}px)`,
                  filter: `blur(${featTextBlur}px)`,
                  letterSpacing: "-0.02em",
                  textShadow:
                    "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
                  textAlign: "center",
                }}
              >
                {FEATURES[activeFeat].label}
              </div>
              <div
                style={{
                  width: interpolate(featTextOp, [0, 1], [0, 80]),
                  height: 3,
                  backgroundColor: FEATURES[activeFeat].color,
                  borderRadius: 2,
                  boxShadow: `0 0 20px ${FEATURES[activeFeat].color}55`,
                }}
              />
            </div>
          </AbsoluteFill>

          {/* Vignette for features */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* ── Logo + brand finale ── */}
      {showLogo && (
        <>
          {/* Background video */}
          <AbsoluteFill style={{ transform: `scale(${logoBgZoom})` }}>
            <Video
              src={staticFile("bg-closing.mp4")}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "brightness(0.2) saturate(0.5) contrast(1.1)",
              }}
            />
          </AbsoluteFill>

          <AbsoluteFill
            style={{
              background:
                "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%)",
            }}
          />

          <AbsoluteFill
            style={{ justifyContent: "center", alignItems: "center" }}
          >
            <Img
              src={staticFile("logo.png")}
              style={{
                width: 90,
                height: 90,
                transform: `scale(${logoScale})`,
                opacity: logoOpacity,
                filter: "drop-shadow(0 0 25px rgba(201, 168, 76, 0.3))",
              }}
            />
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 72,
                fontWeight: 900,
                opacity: titleOpacity,
                marginTop: 20,
                letterSpacing: "-0.03em",
                textShadow:
                  "0 2px 4px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)",
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
              bottom: 50,
              left: 0,
              right: 0,
              textAlign: "center",
              opacity: bottomOpacity,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 14,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              ETH Cannes 2026
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </AbsoluteFill>
  );
};
