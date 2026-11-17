import { z } from "zod";

/**
 * The streamed answers of the AI: server-sent events, one `data: {"response", "done",
 * "error"}` line each (GenAiApi.streamFromEndpoint). The backend sends the whole answer so far
 * in each event, not the new part only. Read with fetch rather than EventSource, which cannot
 * POST.
 */

/** The reason the AI gave, in the middle of an answer, for not finishing it. */
export class AiStreamError extends Error {
  override readonly name = "AiStreamError";
}

const eventSchema = z.object({
  response: z.string().nullish(),
  done: z.boolean().default(false),
  error: z.string().nullish(),
});

/**
 * The answer so far, at each event of [body], until the event marked done. Leaving the loop
 * early cancels the body, so the request stops.
 */
export async function* readAnswer(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // The last piece may be cut in the middle; it waits for the next chunk.
      buffer = done ? "" : lines.pop()!;

      for (const line of lines) {
        const event = parseLine(line);
        if (!event) continue;
        if (event.error) throw new AiStreamError(event.error);
        if (event.response !== null && event.response !== undefined) yield event.response;
        if (event.done) {
          finished = true;
          break;
        }
      }
      if (done) break;
    }
    // A connection that ends before the last event leaves the answer cut.
    if (!finished) throw new AiStreamError("The answer was cut off");
  } finally {
    // Stops the request when the reader left before the end, and frees the lock either way.
    await reader.cancel().catch(() => undefined);
  }
}

function parseLine(line: string): z.output<typeof eventSchema> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  try {
    return eventSchema.parse(JSON.parse(trimmed.slice("data:".length).trim()));
  } catch {
    return null;
  }
}
