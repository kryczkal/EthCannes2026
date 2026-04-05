import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: monoFont } = loadSpaceMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const { fontFamily: sansFont } = loadInter("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

export const fonts = {
  mono: monoFont,
  sans: sansFont,
  heading: sansFont, // Cabinet Grotesk not on Google Fonts, Inter is close enough
} as const;

// Dark theme (Urushi) colors from frontend
export const colors = {
  bg: "#0d0b09",
  bgSecondary: "#181410",
  bgTertiary: "#1f1b15",
  bgCode: "#080604",
  text: "#f0e8da",
  textDim: "rgb(200, 182, 148)",
  textMuted: "rgb(140, 125, 100)",
  accent: "#c9a84c",
  accentLight: "#dfc060",

  safe: "#4ade80",
  safeBg: "rgba(74, 222, 128, 0.1)",
  danger: "#f87171",
  dangerBg: "rgba(248, 113, 113, 0.1)",
  investigating: "#60a5fa",
  investigatingBg: "rgba(96, 165, 250, 0.1)",
  suspected: "#fbbf24",
  suspectedBg: "rgba(251, 191, 36, 0.1)",

  white: "#ffffff",
  black: "#000000",
} as const;

// Spring configs
export const springs = {
  bouncy: { damping: 8 },
  snappy: { damping: 20, stiffness: 200 },
  smooth: { damping: 200 },
  heavy: { damping: 15, stiffness: 80, mass: 2 },
} as const;

// Composition constants
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_FRAMES = 1320; // 44s (40.5s audio + 3.5s pad)

// Scene timing (in frames) — synced to voiceover_eng.srt
export const SCENES = {
  exploitMontage: { from: 0, duration: 150 },      // 0.0–5.0s  | VO: "In 2025, attackers hijacked..." (0.1–4.4s)
  moneyLost: { from: 150, duration: 90 },           // 5.0–8.0s  | VO: "$60B in damage" (5.2–7.0s)
  statsTitle: { from: 240, duration: 140 },          // 8.0–12.7s | VO: "8/10 preventable..." (7.9–11.8s)
  terminal: { from: 380, duration: 115 },            // 12.7–16.5s| VO: "Coding accelerated..." (12.9–15.4s)
  logoReveal: { from: 495, duration: 105 },          // 16.5–20.0s| VO: "npm-guard pentests..." (16.6–19.5s)
  agentFeed: { from: 600, duration: 240 },           // 20.0–28.0s| VO: "First...scans" + "Second...sandbox" (20.3–28.1s)
  verdictSlam: { from: 840, duration: 195 },         // 28.0–34.5s| VO: "Third...proofs" + "prove..." (28.8–35.1s)
  cliDemo: { from: 1035, duration: 135 },            // 34.5–39.0s| VO: "Dangerous blocked" + "Safe install" (36.2–40.5s)
  closingCard: { from: 1170, duration: 150 },        // 39.0–44.0s| Logo + tagline fade
} as const;
