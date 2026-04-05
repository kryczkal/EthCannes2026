import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts, springs } from "../lib/theme";

const CHARS_PER_FRAME = 0.8;

export const CliDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- BLOCKED INSTALL (frames 0-55) ---
  const cmd1 = "npmguard install lodash@4.18.1";
  const typed1 = Math.min(
    Math.floor(frame * CHARS_PER_FRAME),
    cmd1.length,
  );
  const showCmd1Output = frame >= 30;

  // --- SAFE INSTALL (frames 60-120) ---
  const cmd2 = "npmguard install axios@1.7.9";
  const phase2Frame = frame - 60;
  const typed2 =
    phase2Frame > 0
      ? Math.min(Math.floor(phase2Frame * CHARS_PER_FRAME), cmd2.length)
      : 0;
  const showCmd2Output = frame >= 90;

  // Check mark animation
  const checkScale =
    frame >= 105
      ? spring({
          frame: frame - 105,
          fps,
          config: springs.bouncy,
        })
      : 0;

  // Transition between the two
  const phase2Opacity = interpolate(frame, [55, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Reactive glow color: red when blocked, green when safe
  const glowColor =
    frame < 60
      ? "rgba(248, 113, 113, 0.06)"
      : `rgba(74, 222, 128, ${interpolate(frame, [90, 105], [0, 0.06], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 50%, rgba(30, 25, 20, 1) 0%, ${colors.bg} 50%, #000 100%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Reactive glow behind terminal */}
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${glowColor}, transparent 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: 1100,
          backgroundColor: colors.bgCode,
          borderRadius: 12,
          border: `1px solid rgba(255,255,255,0.1)`,
          overflow: "hidden",
          boxShadow:
            "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            gap: 8,
            backgroundColor: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#febc2e" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#28c840" }} />
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: fonts.sans,
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            Terminal
          </div>
        </div>

        <div style={{ padding: "24px 24px", fontFamily: fonts.mono, fontSize: 22 }}>
          {/* --- Command 1: Blocked --- */}
          <div>
            <div style={{ display: "flex" }}>
              <span style={{ color: colors.safe, marginRight: 12 }}>$</span>
              <span style={{ color: colors.text }}>{cmd1.slice(0, typed1)}</span>
              {frame < 30 && typed1 < cmd1.length && (
                <span style={{ color: colors.text, opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0 }}>|</span>
              )}
            </div>

            {showCmd1Output && (
              <div style={{ marginTop: 12, marginLeft: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 18,
                      fontWeight: 700,
                      color: colors.danger,
                      opacity: interpolate(frame, [30, 35], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    CRITICAL
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 14,
                      color: colors.textMuted,
                      opacity: interpolate(frame, [33, 38], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    (score: 92)
                  </span>
                </div>

                <div
                  style={{
                    color: colors.textMuted,
                    fontSize: 14,
                    opacity: interpolate(frame, [36, 42], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  Capabilities: network, filesystem, process_spawn, env_vars
                </div>

                <div
                  style={{
                    color: colors.danger,
                    fontSize: 18,
                    fontWeight: 700,
                    marginTop: 10,
                    opacity: interpolate(frame, [40, 48], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  Installation blocked. This package has critical security issues.
                </div>
              </div>
            )}
          </div>

          {/* --- Command 2: Safe --- */}
          {frame >= 60 && (
            <div style={{ marginTop: 28, opacity: phase2Opacity }}>
              <div style={{ display: "flex" }}>
                <span style={{ color: colors.safe, marginRight: 12 }}>$</span>
                <span style={{ color: colors.text }}>{cmd2.slice(0, typed2)}</span>
                {phase2Frame > 0 && phase2Frame < 30 && typed2 < cmd2.length && (
                  <span style={{ color: colors.text, opacity: Math.floor(phase2Frame / 8) % 2 === 0 ? 1 : 0 }}>|</span>
                )}
              </div>

              {showCmd2Output && (
                <div style={{ marginTop: 12, marginLeft: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 18,
                        fontWeight: 700,
                        color: colors.safe,
                        opacity: interpolate(frame, [90, 95], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }),
                      }}
                    >
                      SAFE
                    </span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        color: colors.textMuted,
                        opacity: interpolate(frame, [93, 98], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }),
                      }}
                    >
                      (score: 96)
                    </span>
                  </div>

                  <div
                    style={{
                      color: colors.safe,
                      fontSize: 16,
                      opacity: interpolate(frame, [97, 103], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    Installed from IPFS: bafkreig7h...x4mq
                  </div>

                  {/* Check mark */}
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 32,
                      transform: `scale(${checkScale})`,
                      display: "inline-block",
                    }}
                  >
                    <span style={{ color: colors.safe }}>&#10003;</span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 16,
                        color: colors.textDim,
                        marginLeft: 8,
                      }}
                    >
                      Verified on ENS + IPFS
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
