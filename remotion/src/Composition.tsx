import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { SCENES } from "./lib/theme";
import { StatsTitle } from "./scenes/StatsTitle";
import { ExploitMontage } from "./scenes/ExploitMontage";
import { MoneyLost } from "./scenes/MoneyLost";
import { Terminal } from "./scenes/Terminal";
import { LogoReveal } from "./scenes/LogoReveal";
import { AgentFeed } from "./scenes/AgentFeed";
import { VerdictSlam } from "./scenes/VerdictSlam";
import { CliDemo } from "./scenes/CliDemo";
import { ClosingCard } from "./scenes/ClosingCard";
import { NoiseOverlay } from "./lib/visuals";

export const NpmGuardPromo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Voiceover track — plays for the entire composition */}
      <Audio src={staticFile("voiceover.mp3")} />

      {/* ACT 1: The Problem */}

      <Sequence
        from={SCENES.exploitMontage.from}
        durationInFrames={SCENES.exploitMontage.duration}
        premountFor={fps}
      >
        <ExploitMontage />
      </Sequence>

      <Sequence
        from={SCENES.moneyLost.from}
        durationInFrames={SCENES.moneyLost.duration}
        premountFor={fps}
      >
        <MoneyLost />
      </Sequence>

      <Sequence
        from={SCENES.statsTitle.from}
        durationInFrames={SCENES.statsTitle.duration}
        premountFor={fps}
      >
        <StatsTitle />
      </Sequence>

      {/* ACT 2: The Trigger */}

      <Sequence
        from={SCENES.terminal.from}
        durationInFrames={SCENES.terminal.duration}
        premountFor={fps}
      >
        <Terminal />
      </Sequence>

      {/* ACT 3: The Solution */}

      <Sequence
        from={SCENES.logoReveal.from}
        durationInFrames={SCENES.logoReveal.duration}
        premountFor={fps}
      >
        <LogoReveal />
      </Sequence>

      <Sequence
        from={SCENES.agentFeed.from}
        durationInFrames={SCENES.agentFeed.duration}
        premountFor={fps}
      >
        <AgentFeed />
      </Sequence>

      <Sequence
        from={SCENES.verdictSlam.from}
        durationInFrames={SCENES.verdictSlam.duration}
        premountFor={fps}
      >
        <VerdictSlam />
      </Sequence>

      <Sequence
        from={SCENES.cliDemo.from}
        durationInFrames={SCENES.cliDemo.duration}
        premountFor={fps}
      >
        <CliDemo />
      </Sequence>

      <Sequence
        from={SCENES.closingCard.from}
        durationInFrames={SCENES.closingCard.duration}
        premountFor={fps}
      >
        <ClosingCard />
      </Sequence>

      {/* Film grain overlay — sits above all scenes */}
      <NoiseOverlay opacity={0.015} />
    </AbsoluteFill>
  );
};
