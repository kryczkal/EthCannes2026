import {
  HTTPCapability,
  handler,
  Runner,
} from "@chainlink/cre-sdk";
import { onHttpTrigger } from "./workflow";

type Config = {
  packages: string[];
  auditApiUrl: string;
};

const initWorkflow = (_config: Config) => {
  const http = new HTTPCapability();
  return [handler(http.trigger({}), onHttpTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
