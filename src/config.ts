/**
 * App configuration, read from `LEAFFOCUS_*` environment variables. Bun loads `.env` automatically,
 * so a `.env` file (see `.env.example`) acts as the config file.
 */
export interface Config {
  /** Model passed to `claude --model` (e.g. `haiku`); undefined uses the CLI default. */
  model: string | undefined;
  /** Render in the terminal's alternate screen at full height (like vim/htop), restoring the terminal on exit. */
  fullscreen: boolean;
}

/** `1`/`true`/`yes`/`on` (any case) are true; anything else, including unset, is false. */
function parseBoolean(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  return {
    model: env.LEAFFOCUS_MODEL?.trim() || undefined,
    fullscreen: parseBoolean(env.LEAFFOCUS_FULLSCREEN),
  };
}

export const config: Config = parseConfig(process.env);
