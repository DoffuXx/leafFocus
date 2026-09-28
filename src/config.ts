import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * App configuration. Sources, highest precedence first:
 * 1. `LEAFFOCUS_*` environment variables (Bun loads `.env` automatically, see `.env.example`)
 * 2. a YAML config file (see `leaffocus.example.yaml` and {@link CONFIG_PATHS})
 * 3. built-in defaults
 */
export interface Config {
  /** Model passed to `claude --model` (e.g. `haiku`); undefined uses the CLI default. */
  model: string | undefined;
  /** Render in the terminal's alternate screen at full height (like vim/htop), restoring the terminal on exit. */
  fullscreen: boolean;
}

/** YAML config files, checked in order; the first one that exists is used. */
export const CONFIG_PATHS = ['leaffocus.yaml', join(homedir(), '.config', 'leaffocus', 'config.yaml')];

/** Shape of the YAML config file; every key is optional. */
const fileConfigSchema = z.object({
  model: z.string().optional(),
  fullscreen: z.boolean().optional(),
});

export type FileConfig = z.infer<typeof fileConfigSchema>;

/** `1`/`true`/`yes`/`on` (any case) are true; anything else is false. */
function parseBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** Merges env vars over the YAML file values over defaults. Blank env values count as unset. */
export function parseConfig(env: Record<string, string | undefined>, file: FileConfig = {}): Config {
  const fullscreenEnv = env.LEAFFOCUS_FULLSCREEN?.trim();
  return {
    model: env.LEAFFOCUS_MODEL?.trim() || file.model?.trim() || undefined,
    fullscreen: fullscreenEnv ? parseBoolean(fullscreenEnv) : (file.fullscreen ?? false),
  };
}

/** Reads the first existing file in `paths`; `{}` if none. Throws on invalid YAML or unknown value types. */
export function loadConfigFile(paths: string[] = CONFIG_PATHS): FileConfig {
  const path = paths.find((p) => existsSync(p));
  if (!path) return {};
  const result = fileConfigSchema.safeParse(Bun.YAML.parse(readFileSync(path, 'utf8')) ?? {});
  if (!result.success) throw new Error(`Invalid config file ${path}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Like {@link loadConfigFile}, but exits with a readable message instead of a stack trace. */
function loadConfigFileOrExit(): FileConfig {
  try {
    return loadConfigFile();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export const config: Config = parseConfig(process.env, loadConfigFileOrExit());
