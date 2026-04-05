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
import { colors, fonts, springs, gradients } from "../lib/theme";

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // White → dark transition
  const bgFade = interpolate(frame, [0, 25], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  // Logo scales in with spring
  const logoScale = spring({
    frame: frame - 10,
    fps,
    config: springs.snappy,
  });

  const logoOpacity = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tagline fades in
  const taglineOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [25, 40], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gold accent line — wider
  const lineWidth = spring({
    frame: frame - 30,
    fps,
    config: springs.smooth,
  });

  // Logo glow
  const logoGlow = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.1, 0.25],
  );

  return (
    <AbsoluteFill
      style={{
        background: gradients.bgRadial,
      }}
    >
      {/* White overlay fading out */}
      <AbsoluteFill
        style={{
          backgroundColor: colors.white,
          opacity: bgFade,
        }}
      />

      {/* Glow ring behind logo */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          transform: "translate(-50%, -65%)",
          background: `radial-gradient(ellipse, rgba(201, 168, 76, ${logoGlow}), transparent 70%)`,
          filter: "blur(50px)",
          pointerEvents: "none",
          opacity: logoOpacity,
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 140,
            height: 140,
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            filter: `drop-shadow(0 0 30px rgba(201, 168, 76, 0.3))`,
          }}
        />

        {/* Gold accent line — wider, gradient */}
        <div
          style={{
            width: interpolate(lineWidth, [0, 1], [0, 300]),
            height: 2,
            background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            marginTop: 28,
            marginBottom: 28,
            borderRadius: 1,
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 52,
            fontWeight: 700,
            color: colors.text,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            letterSpacing: "-0.02em",
            textShadow: "0 4px 30px rgba(0,0,0,0.5)",
          }}
        >
          Know what you install.
        </div>
      </AbsoluteFill>

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
