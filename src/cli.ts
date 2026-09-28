import { parseArgs } from 'node:util';
import pkg from '../package.json';
import type { FileConfig } from './config.js';

/** Parsed command-line flags. */
export interface CliArgs {
  /** `-h`/`--help`: print {@link HELP} and exit. */
  help: boolean;
  /** `-v`/`--version`: print the version and exit. */
  version: boolean;
  /** `-r`/`--resume`: pick a past session instead of starting fresh (like `claude -r`). */
  resume: boolean;
  /** Config values set by flags; they override env vars and the YAML file. */
  overrides: FileConfig;
}

export const HELP = `leaffocus ${pkg.version} — ${pkg.description}

Usage: leaffocus [options]

Options:
  -r, --resume               Pick a past session to continue
  -m, --model <name>         Model for \`claude --model\` (e.g. haiku); overrides LEAFFOCUS_MODEL
  -f, --fullscreen           Render full-screen; overrides LEAFFOCUS_FULLSCREEN
  -i, --instructions <text>  Standing instructions for every answer; overrides LEAFFOCUS_INSTRUCTIONS
  -v, --version              Print the version and exit
  -h, --help                 Print this help and exit

Config: flags > LEAFFOCUS_* env vars (.env) > ./leaffocus.yaml or ~/.config/leaffocus/config.yaml`;

/** Parses `argv` (without the runtime/script entries). Throws on unknown flags or a missing value. */
export function parseCli(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      resume: { type: 'boolean', short: 'r' },
      model: { type: 'string', short: 'm' },
      fullscreen: { type: 'boolean', short: 'f' },
      instructions: { type: 'string', short: 'i' },
    },
    strict: true,
  });
  return {
    help: values.help ?? false,
    version: values.version ?? false,
    resume: values.resume ?? false,
    overrides: { model: values.model, fullscreen: values.fullscreen, instructions: values.instructions },
  };
}

/** Like {@link parseCli}, but handles `--help`/`--version` and bad flags by printing and exiting. */
function parseCliOrExit(): CliArgs {
  let args: CliArgs;
  try {
    args = parseCli(process.argv.slice(2));
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : error}\nRun \`leaffocus --help\` for usage.`);
    process.exit(1);
  }
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.version) {
    console.log(pkg.version);
    process.exit(0);
  }
  return args;
}

export const cli: CliArgs = parseCliOrExit();
