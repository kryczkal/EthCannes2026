import "./index.css";
import { Composition } from "remotion";
import { NpmGuardPromo } from "./Composition";
import { FPS, WIDTH, HEIGHT, DURATION_FRAMES } from "./lib/theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="NpmGuardPromo"
        component={NpmGuardPromo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
