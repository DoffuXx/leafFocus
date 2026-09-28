import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config, type Config } from './config.js';
import { appendLog } from './log.js';
import type { ParagraphResult, Usage } from './types.js';

/**
 * Runs `claude` with stdin explicitly closed. `child_process.execFile` leaves the child's
 * stdin open as an unclosed pipe by default, which makes the CLI sit waiting on stdin before
 * eventually failing — closing it immediately avoids that stall.
 * Aborting `signal` kills the child and rejects with an `AbortError`.
 */
function runClaude(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

const SYSTEM_PROMPT = 'You are a helpful assistant. Respond only with the requested JSON — no extra commentary.';

const PARAGRAPH_INSTRUCTIONS =
  'Write your answer as a single flowing paragraph. Then segment that entire paragraph into 2-10 ' +
  'consecutive chunks by meaning/context — the segments, concatenated in order, must reconstruct the ' +
  'whole paragraph with nothing left out. Copy each segment verbatim from the paragraph, in reading order.';

// Passed to `claude --json-schema` to force structured output.
const PARAGRAPH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    paragraph: { type: 'string' },
    segments: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
  },
  required: ['paragraph', 'segments'],
};

const responseSchema = z.object({
  paragraph: z.string().min(1),
  segments: z.array(z.string().min(1)).min(1),
});

interface CliResultEvent {
  type: 'result';
  is_error: boolean;
  result?: string;
  structured_output?: unknown;
  duration_ms?: number;
  total_cost_usd?: number;
}

/**
 * Builds the prompt for one call: just the immediate parent paragraph + the segment drilled into
 * (if any) plus the new question — not the full ancestor chain.
 */
export function buildPrompt(
  parent: { paragraph: string; segment: string | null } | null,
  question: string
): string {
  if (!parent) return `Q: ${question}\n\n${PARAGRAPH_INSTRUCTIONS}`;
  const focusLine = parent.segment ? `\nFocus segment: "${parent.segment}"` : '';
  return `Context paragraph: ${parent.paragraph}${focusLine}\n\nQ: ${question}\n\n${PARAGRAPH_INSTRUCTIONS}`;
}

/**
 * `claude --output-format json` prints a JSON array of event objects (e.g. a `system`
 * init event followed by the final `result` event), not a single envelope object.
 * Pulls the result event out of that array, validates the shape, and keeps only segments
 * that are actual verbatim substrings of the paragraph (models sometimes paraphrase).
 */
export function parseParagraphOutput(stdout: string): ParagraphResult {
  const events = JSON.parse(stdout) as unknown[];
  const resultEvent = events.find(
    (e): e is CliResultEvent => typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'result'
  );
  if (!resultEvent) {
    throw new Error('claude CLI output did not contain a result event');
  }
  if (resultEvent.is_error) {
    throw new Error(`claude CLI reported an error: ${resultEvent.result ?? 'unknown error'}`);
  }

  const payload = resultEvent.structured_output ?? JSON.parse(resultEvent.result ?? 'null');
  const { paragraph, segments } = responseSchema.parse(payload);

  const verbatimSegments = segments.filter((s) => paragraph.includes(s));
  if (verbatimSegments.length === 0) {
    throw new Error('none of the returned segments appear verbatim in the paragraph');
  }

  const usage: Usage | undefined =
    typeof resultEvent.duration_ms === 'number' && typeof resultEvent.total_cost_usd === 'number'
      ? { durationMs: resultEvent.duration_ms, costUsd: resultEvent.total_cost_usd }
      : undefined;

  return { paragraph, segments: verbatimSegments, ...(usage ? { usage } : {}) };
}

/**
 * CLI args for one headless call. `model` is passed as `--model` (unset = CLI default) and
 * `instructions` is appended to the system prompt; both default to the app config.
 *
 * --allowedTools '' keeps this a plain Q&A call, not an agent with file/bash access.
 * --max-turns 3 (not 1): forcing structured output via --json-schema makes the CLI
 * emit its answer through an internal tool call, which alone can exceed 1 turn —
 * observed a real `error_max_turns` failure at max-turns 1 with num_turns: 2.
 */
export function buildClaudeArgs(
  prompt: string,
  { model, instructions }: Pick<Config, 'model' | 'instructions'> = config
): string[] {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(PARAGRAPH_JSON_SCHEMA),
    '--append-system-prompt',
    instructions ? `${SYSTEM_PROMPT}\n\n${instructions}` : SYSTEM_PROMPT,
    '--max-turns',
    '3',
    '--allowedTools',
    '',
  ];
  return model ? [...args, '--model', model] : args;
}

/**
 * Shells out to the `claude` CLI in headless mode and returns a validated paragraph + segments.
 * Pass `signal` to allow cancelling the call mid-flight.
 */
export async function getParagraph(
  parent: { paragraph: string; segment: string | null } | null,
  question: string,
  signal?: AbortSignal
): Promise<ParagraphResult> {
  const prompt = buildPrompt(parent, question);
  const requestId = randomUUID();
  const startedAt = performance.now();
  const elapsedMs = (): number => Math.round(performance.now() - startedAt);
  appendLog({ event: 'request', requestId, question, prompt, model: config.model });

  try {
    const stdout = await runClaude(buildClaudeArgs(prompt), signal);

    const result = parseParagraphOutput(stdout);
    appendLog({
      event: 'response',
      requestId,
      question,
      stdout,
      segmentCount: result.segments.length,
      durationMs: elapsedMs(),
    });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendLog({ event: 'error', requestId, question, error, durationMs: elapsedMs() });
    throw err;
  }
}
