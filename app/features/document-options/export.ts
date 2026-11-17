import type { Document, StoryStep } from "~/core/models";
import { isTitle, textOf } from "~/features/editor/state/blocks";
import { toMarkdown } from "~/features/editor/state/markdown";
import type { Block } from "~/features/editor/state/types";

/** The document as files to download (writeopia_export), and as text for the AI. */

/** The steps as they are saved: without the ones that only live on this screen. */
function savedSteps(blocks: readonly Block[]): StoryStep[] {
  return blocks
    .filter((block) => !block.ephemeral)
    .map(({ ephemeral: _ephemeral, ...step }) => step);
}

export function documentMarkdown(blocks: readonly Block[]): string {
  return `${toMarkdown(savedSteps(blocks))}\n`;
}

/** The text of the document under its title, one line per block, for the AI to read. */
export function documentText(blocks: readonly Block[]): string {
  return blocks
    .filter((block) => !isTitle(block) && !block.ephemeral)
    .map(textOf)
    .filter((text) => text.trim() !== "")
    .join("\n");
}

/** The Document of the wire format, the shape the other apps import. */
export function documentJson(document: Document, blocks: readonly Block[]): string {
  const content = savedSteps(blocks);
  const title = textOf(content.find(isTitle) ?? { text: document.title });
  return JSON.stringify({ ...document, title, content }, null, 2);
}

/** A file name from the title, without the characters file systems refuse. */
export function exportFileName(title: string, extension: string): string {
  const name = [...title]
    .map((character) => (character < " " ? " " : character))
    .join("")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${name || "Untitled"}.${extension}`;
}

/** Hands the browser a file to save. */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
