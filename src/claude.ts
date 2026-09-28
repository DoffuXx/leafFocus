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

// Only the segments are requested (the paragraph is rebuilt by joining them): asking for both made
// the model write every answer twice, roughly doubling output tokens and generation time.
const PARAGRAPH_INSTRUCTIONS =
  'Write your answer as a single flowing paragraph, split into 2-10 consecutive chunks by ' +
  'meaning/context, in reading order. Return only the chunks — joined with spaces they must form ' +
  'the whole paragraph with nothing left out.';

// Passed to `claude --json-schema` to force structured output.
const PARAGRAPH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    segments: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
  },
  required: ['segments'],
};

const responseSchema = z.object({
  segments: z.array(z.string().trim().min(1)).min(1),
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
 * `claude --output-format json` prints either a JSON array of event objects (e.g. a `system`
 * init event followed by the final `result` event) or, depending on CLI version, the single
 * `result` object. Pulls the result event out, validates the shape, and joins the segments into
 * the paragraph, so every segment is a verbatim substring of it by construction.
 */
export function parseParagraphOutput(stdout: string): ParagraphResult {
  const parsed: unknown = JSON.parse(stdout);
  const events: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
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
  const { segments } = responseSchema.parse(payload);
  const paragraph = segments.join(' ');

  const usage: Usage | undefined =
    typeof resultEvent.duration_ms === 'number' && typeof resultEvent.total_cost_usd === 'number'
      ? { durationMs: resultEvent.duration_ms, costUsd: resultEvent.total_cost_usd }
      : undefined;

  return { paragraph, segments, ...(usage ? { usage } : {}) };
}

/**
 * CLI args for one headless call. `model` is passed as `--model` (unset = CLI default) and
 * `instructions` is appended to the system prompt; both default to the app config.
 *
 * Speed: --tools '' drops all built-in tool definitions (~30k input tokens, not just their
 * permission like --allowedTools); --strict-mcp-config, --disable-slash-commands and
 * --no-session-persistence skip loading the user's MCP servers and skills and writing a transcript;
 * --effort low cuts thinking time — a short paragraph doesn't need deep reasoning.
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
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--effort',
    'low',
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
