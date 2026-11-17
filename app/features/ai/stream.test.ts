import { describe, expect, it } from "vitest";

import { AiStreamError, readAnswer } from "./stream";

function bytes(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const answers: string[] = [];
  for await (const answer of readAnswer(stream)) answers.push(answer);
  return answers;
}

const line = (value: object) => `data: ${JSON.stringify(value)}\n\n`;

describe("readAnswer", () => {
  it("yields the answer so far at each event and stops at done", async () => {
    const answers = await collect(
      bytes(
        line({ response: "Hel", done: false }),
        line({ response: "Hello", done: false }),
        line({ response: "Hello!", done: true }),
        line({ response: "ignored", done: false }),
      ),
    );
    expect(answers).toEqual(["Hel", "Hello", "Hello!"]);
  });

  it("joins an event cut between two chunks", async () => {
    const event = line({ response: "Olá, mundo", done: true });
    const encoded = new TextEncoder().encode(event);
    // Cut in the middle of the two bytes of "á".
    const cut = event.indexOf("á") + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, cut));
        controller.enqueue(encoded.slice(cut));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual(["Olá, mundo"]);
  });

  it("reads a last event without its blank line", async () => {
    expect(await collect(bytes('data: {"response":"end","done":false}'))).toEqual(["end"]);
  });

  it("skips lines that are not data and events without a response", async () => {
    const answers = await collect(
      bytes(": keep-alive\n", "event: x\n", line({ done: false }), line({ response: "a" })),
    );
    expect(answers).toEqual(["a"]);
  });

  it("throws the error an event carries", async () => {
    const answers: string[] = [];
    const reading = (async () => {
      for await (const answer of readAnswer(
        bytes(line({ response: "part" }), line({ error: "Quota exceeded", done: true })),
      )) {
        answers.push(answer);
      }
    })();
    await expect(reading).rejects.toEqual(new AiStreamError("Quota exceeded"));
    expect(answers).toEqual(["part"]);
  });

  it("stops reading when the reader leaves early", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(line({ response: "a" })));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const answer of readAnswer(stream)) {
      expect(answer).toBe("a");
      break;
    }
    expect(cancelled).toBe(true);
  });
});
