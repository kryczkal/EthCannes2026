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
import { colors, fonts, springs } from "../lib/theme";

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

  // Gold accent line
  const lineWidth = spring({
    frame: frame - 30,
    fps,
    config: springs.smooth,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* White overlay fading out */}
      <AbsoluteFill
        style={{
          backgroundColor: colors.white,
          opacity: bgFade,
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
          src={staticFile("logo.svg")}
          style={{
            width: 120,
            height: 120,
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        />

        {/* Gold accent line */}
        <div
          style={{
            width: interpolate(lineWidth, [0, 1], [0, 200]),
            height: 2,
            backgroundColor: colors.accent,
            marginTop: 24,
            marginBottom: 24,
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 48,
            fontWeight: 700,
            color: colors.text,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            letterSpacing: "-0.02em",
          }}
        >
          Know what you install.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
