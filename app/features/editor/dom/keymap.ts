/**
 * Keys to editor commands, from KeyboardCommands.kt and KeyboardEvent.kt of the Compose app.
 * The command key is ⌘ on macOS and Ctrl elsewhere. Pure, so it is tested without a page.
 */

export type KeyCommand =
  | "split"
  | "eraseAtStart"
  | "deleteAtEnd"
  | "deleteSelection"
  | "previousLine"
  | "nextLine"
  | "previousBlockEnd"
  | "nextBlockStart"
  | "extendUp"
  | "extendDown"
  | "selectAll"
  | "bold"
  | "italic"
  | "underline"
  | "box"
  | "link"
  | "list"
  | "undo"
  | "redo"
  | "find"
  | "escape"
  | "slashUp"
  | "slashDown"
  | "slashPick";

export type KeyInput = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
};

export type KeyContext = {
  isMac: boolean;
  /** A text block has the caret; false when the keys reach the editor itself. */
  inText: boolean;
  caretStart: number;
  caretEnd: number;
  textLength: number;
  onFirstLine: boolean;
  onLastLine: boolean;
  slashOpen: boolean;
  hasBlockSelection: boolean;
  /** The whole text of the block is selected (or it is empty): ⌘A goes to the blocks. */
  allTextSelected: boolean;
};

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function keyCommand(event: KeyInput, context: KeyContext): KeyCommand | null {
  if (event.isComposing) return null;

  const command = context.isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const collapsed = context.caretStart === context.caretEnd;

  if (context.slashOpen && !command) {
    if (key === "ArrowUp") return "slashUp";
    if (key === "ArrowDown") return "slashDown";
    if (key === "Enter" || key === "Tab") return "slashPick";
    if (key === "Escape") return "escape";
  }

  if (command && !event.altKey) {
    switch (key) {
      case "z":
        return event.shiftKey ? "redo" : "undo";
      case "y":
        return context.isMac ? null : "redo";
      case "b":
        return event.shiftKey ? "box" : "bold";
      case "i":
        return event.shiftKey ? null : "italic";
      case "u":
        return event.shiftKey ? null : "underline";
      case "l":
        return event.shiftKey ? null : "link";
      case "f":
        return event.shiftKey ? null : "find";
      case "-":
        return "list";
      case "a":
        return context.hasBlockSelection || !context.inText || context.allTextSelected
          ? "selectAll"
          : null;
    }
  }

  if (key === "Escape") return "escape";

  if (context.hasBlockSelection && (key === "Backspace" || key === "Delete")) {
    return "deleteSelection";
  }
  if (event.shiftKey && !command && key === "ArrowUp") {
    return context.hasBlockSelection || (context.inText && context.onFirstLine && collapsed)
      ? "extendUp"
      : null;
  }
  if (event.shiftKey && !command && key === "ArrowDown") {
    return context.hasBlockSelection || (context.inText && context.onLastLine && collapsed)
      ? "extendDown"
      : null;
  }

  if (!context.inText || command || event.altKey) return null;

  switch (key) {
    case "Enter":
      return "split";
    case "Backspace":
      return collapsed && context.caretStart === 0 ? "eraseAtStart" : null;
    case "Delete":
      return collapsed && context.caretEnd === context.textLength ? "deleteAtEnd" : null;
    case "ArrowUp":
      return event.shiftKey || !context.onFirstLine ? null : "previousLine";
    case "ArrowDown":
      return event.shiftKey || !context.onLastLine ? null : "nextLine";
    case "ArrowLeft":
      return !event.shiftKey && collapsed && context.caretStart === 0 ? "previousBlockEnd" : null;
    case "ArrowRight":
      return !event.shiftKey && collapsed && context.caretEnd === context.textLength
        ? "nextBlockStart"
        : null;
  }
  return null;
}
