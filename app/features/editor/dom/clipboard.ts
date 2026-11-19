import { generateId } from "~/core/id";
import { type StoryStep, storyStepSchema } from "~/core/models";

import { parseMarkdown, toMarkdown } from "../state/markdown";
import { toStep } from "../state/reducer";
import type { Block } from "../state/types";
import { isMedia } from "./files";

/**
 * What the editor puts in the clipboard and reads from it. Blocks travel twice: as Markdown
 * in text/plain for every other app, and as their steps in a type of our own, so a paste into
 * Writeopia keeps everything (CopyManager.kt, LinePasteboard.swift).
 */

/** The clipboard type of copied steps, as JSON. */
export const STEPS_MIME = "application/x-writeopia-steps";

type ClipboardWriter = Pick<DataTransfer, "setData">;
type ClipboardReader = Pick<DataTransfer, "getData" | "files" | "types">;

export function writeBlocks(clipboard: ClipboardWriter, blocks: readonly Block[]) {
  const steps = blocks.map(toStep);
  clipboard.setData("text/plain", toMarkdown(steps));
  clipboard.setData(STEPS_MIME, JSON.stringify(steps));
}

/** A step pasted gets a new id: the copied one may still be in the document. */
function fresh(step: StoryStep): Block {
  return { ...step, id: generateId(), lastUpdatedAt: null, steps: step.steps.map(fresh) };
}

export type Pasted =
  | { kind: "blocks"; blocks: Block[] }
  | { kind: "text"; text: string }
  | { kind: "media"; files: File[] }
  | { kind: "nothing" };

/** What a paste brings, in order of preference: our steps, pictures and videos, then plain text. */
export function readClipboard(clipboard: ClipboardReader): Pasted {
  const raw = clipboard.getData(STEPS_MIME);
  if (raw) {
    try {
      const parsed = storyStepSchema.array().safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.length > 0) {
        return { kind: "blocks", blocks: parsed.data.map(fresh) };
      }
    } catch {
      // Not ours after all: read it as text.
    }
  }

  const media = Array.from(clipboard.files ?? []).filter(isMedia);
  if (media.length > 0) return { kind: "media", files: media };

  const text = clipboard.getData("text/plain");
  return text ? { kind: "text", text } : { kind: "nothing" };
}

/** Plain text pasted: one line stays text in the line, more become blocks. */
export function textToBlocks(text: string): Block[] | null {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return normalized.includes("\n") ? parseMarkdown(normalized) : null;
}
