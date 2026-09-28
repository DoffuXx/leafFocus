import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { cli } from './cli.js';
// Embedded as text so `--init` works from a standalone binary, where the example file is not on disk.
import configTemplate from '../leaffocus.example.yaml' with { type: 'text' };

/**
 * App configuration. Sources, highest precedence first:
 * 1. command-line flags (see `src/cli.ts`)
 * 2. `LEAFFOCUS_*` environment variables (Bun loads `.env` automatically, see `.env.example`)
 * 3. a YAML config file (see `leaffocus.example.yaml` and {@link CONFIG_PATHS})
 * 4. built-in defaults
 */
export interface Config {
  /** Model passed to `claude --model` (e.g. `haiku`); undefined uses the CLI default. */
  model: string | undefined;
  /** Render in the terminal's alternate screen at full height (like vim/htop), restoring the terminal on exit. */
  fullscreen: boolean;
  /** Extra standing instructions appended to every call's system prompt (e.g. "answer in French"). */
  instructions: string | undefined;
}

/** Global config file: `$XDG_CONFIG_HOME/leaffocus/config.yaml`, defaulting to `~/.config/leaffocus/config.yaml`. */
export function globalConfigPath(env: Record<string, string | undefined>): string {
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config'), 'leaffocus', 'config.yaml');
}

/** YAML config files, checked in order; the first one that exists is used. */
export const CONFIG_PATHS = ['leaffocus.yaml', globalConfigPath(process.env)];

/** Shape of the YAML config file; every key is optional. */
const fileConfigSchema = z.object({
  model: z.string().optional(),
  fullscreen: z.boolean().optional(),
  instructions: z.string().optional(),
});

export type FileConfig = z.infer<typeof fileConfigSchema>;

/** `1`/`true`/`yes`/`on` (any case) are true; anything else is false. */
function parseBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** Merges flags over env vars over the YAML file values over defaults. Blank values count as unset. */
export function parseConfig(
  env: Record<string, string | undefined>,
  file: FileConfig = {},
  flags: FileConfig = {}
): Config {
  const fullscreenEnv = env.LEAFFOCUS_FULLSCREEN?.trim();
  return {
    model: flags.model?.trim() || env.LEAFFOCUS_MODEL?.trim() || file.model?.trim() || undefined,
    fullscreen: flags.fullscreen ?? (fullscreenEnv ? parseBoolean(fullscreenEnv) : (file.fullscreen ?? false)),
    instructions:
      flags.instructions?.trim() || env.LEAFFOCUS_INSTRUCTIONS?.trim() || file.instructions?.trim() || undefined,
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

/**
 * Writes the commented example config to `path` (creating its folder) for `leaffocus --init`.
 * Returns false, leaving the file untouched, if it already exists.
 */
export function initConfigFile(path: string, template: string = configTemplate): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, template);
  return true;
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

export const config: Config = parseConfig(process.env, loadConfigFileOrExit(), cli.overrides);
