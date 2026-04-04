import {
  CronCapability,
  HTTPCapability,
  handler,
  Runner,
} from "@chainlink/cre-sdk";
import { onHttpTrigger, onCronTrigger } from "./workflow";

type Config = {
  packages: string[];
  auditApiUrl: string;
  creApiKey: string;
  schedule: string;
};

const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const cron = new CronCapability();

  return [
    handler(http.trigger({}), onHttpTrigger),
    handler(cron.trigger({ schedule: config.schedule }), onCronTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
