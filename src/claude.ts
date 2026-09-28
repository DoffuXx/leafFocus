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
 * `onLine` receives each complete stdout line as it arrives (for streaming).
 * Aborting `signal` kills the child and rejects with an `AbortError`.
 */
function runClaude(args: string[], signal?: AbortSignal, onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
      if (!onLine) return;
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) onLine(line);
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
 * Splits CLI stdout into event objects: `--output-format json` prints a JSON array of events or,
 * depending on CLI version, the single `result` object; `stream-json` prints one event per line.
 */
function parseEvents(stdout: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
  }
}

/**
 * Pulls the `result` event out of the CLI output (any format, see `parseEvents`), validates the
 * shape, and joins the segments into the paragraph, so every segment is a verbatim substring of it
 * by construction.
 */
export function parseParagraphOutput(stdout: string): ParagraphResult {
  const events = parseEvents(stdout);
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
 * Best-effort read of the segments so far from the partial `{"segments": ["…", "…` JSON streamed
 * by the structured-output tool call. The last, still-open string is included as-is; a trailing
 * incomplete escape is dropped. Never throws — a malformed prefix just yields fewer segments.
 */
export function extractPartialSegments(partialJson: string): string[] {
  const start = partialJson.indexOf('[');
  if (start < 0) return [];
  const segments: string[] = [];
  let current: string | null = null;
  for (let i = start + 1; i < partialJson.length; i++) {
    const ch = partialJson[i] as string;
    if (current === null) {
      if (ch === '"') current = '';
      else if (ch === ']') break;
      continue;
    }
    if (ch === '"') {
      segments.push(current);
      current = null;
    } else if (ch === '\\') {
      const length = partialJson[i + 1] === 'u' ? 6 : 2; // \uXXXX or \n-style
      const escape = partialJson.slice(i, i + length);
      if (escape.length < length) break; // escape cut off mid-stream
      try {
        current += JSON.parse(`"${escape}"`) as string;
      } catch {
        break;
      }
      i += length - 1;
    } else {
      current += ch;
    }
  }
  if (current) segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/** `stream-json` line carrying a chunk of the structured-output tool's JSON input, else null. */
function partialJsonDelta(line: string): string | null {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      event?: { type?: string; delta?: { type?: string; partial_json?: string } };
    };
    const delta = event.type === 'stream_event' && event.event?.type === 'content_block_delta' ? event.event.delta : undefined;
    return delta?.type === 'input_json_delta' ? (delta.partial_json ?? null) : null;
  } catch {
    return null;
  }
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
    // stream-json + partial messages: the answer's JSON arrives token by token, so the UI can
    // show segments while they are written instead of after the whole call (--verbose is
    // required by the CLI for stream-json in -p mode).
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
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
 * Pass `signal` to allow cancelling the call mid-flight, and `onPartial` to receive the segments
 * written so far while the answer streams in (unvalidated preview; the resolved value is final).
 */
export async function getParagraph(
  parent: { paragraph: string; segment: string | null } | null,
  question: string,
  signal?: AbortSignal,
  onPartial?: (segments: string[]) => void
): Promise<ParagraphResult> {
  const prompt = buildPrompt(parent, question);
  const requestId = randomUUID();
  const startedAt = performance.now();
  const elapsedMs = (): number => Math.round(performance.now() - startedAt);
  appendLog({ event: 'request', requestId, question, prompt, model: config.model });

  try {
    let partialJson = '';
    const stdout = await runClaude(buildClaudeArgs(prompt), signal, (line) => {
      const delta = partialJsonDelta(line);
      if (delta === null) return;
      partialJson += delta;
      onPartial?.(extractPartialSegments(partialJson));
    });

    const result = parseParagraphOutput(stdout);
    appendLog({
      event: 'response',
      requestId,
      question,
      // token deltas would bloat the log; keep the other events (init, assistant, result)
      stdout: stdout
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('{"type":"stream_event"'))
        .join('\n'),
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
