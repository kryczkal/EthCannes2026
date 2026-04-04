import 'dotenv/config';

export interface OpenClawEnv {
  command: string;
  args: string[];
  maxTurns: number;
  resetBeforeRun: boolean;
  resetSessionKey?: string;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function readOptionValue(args: string[], flag: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (entry === flag) {
      const value = args[index + 1];
      return value && !value.startsWith('-') ? value : undefined;
    }

    if (entry.startsWith(`${flag}=`)) {
      const value = entry.slice(flag.length + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
}

export function readOpenClawEnv(): OpenClawEnv {
  const command = process.env.OPENCLAW_CMD?.trim() || 'openclaw';
  const argString = process.env.OPENCLAW_ARGS?.trim() || '--local --json --agent verifier';
  const args = argString.length > 0 ? argString.split(/\s+/) : [];
  const agentId = readOptionValue(args, '--agent');
  const explicitResetBeforeRun = parseBooleanEnv(process.env.OPENCLAW_RESET_BEFORE_RUN);
  const resetBeforeRun = explicitResetBeforeRun ?? !args.includes('--local');
  const resetSessionKey =
    process.env.OPENCLAW_RESET_SESSION_KEY?.trim() ||
    (agentId && agentId.length > 0 ? `agent:${agentId}:main` : undefined);

  return {
    command,
    args,
    maxTurns: Number(process.env.OPENCLAW_MAX_TURNS ?? 16),
    resetBeforeRun,
    resetSessionKey: resetSessionKey && resetSessionKey.length > 0 ? resetSessionKey : undefined,
  };
}
