import 'dotenv/config';

export interface OpenClawEnv {
  command: string;
  args: string[];
  maxTurns: number;
  sessionId?: string;
}

export function readOpenClawEnv(): OpenClawEnv {
  const command = process.env.OPENCLAW_CMD?.trim() || 'openclaw';
  const argString = process.env.OPENCLAW_ARGS?.trim() || '--local --json --agent verifier';
  const sessionId = process.env.OPENCLAW_SESSION_ID?.trim();

  return {
    command,
    args: argString.length > 0 ? argString.split(/\s+/) : [],
    maxTurns: Number(process.env.OPENCLAW_MAX_TURNS ?? 16),
    sessionId: sessionId && sessionId.length > 0 ? sessionId : undefined,
  };
}
