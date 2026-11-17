import type { Block, Caret } from "./types";

/**
 * Undo and redo, as snapshots of the document taken before each change, like
 * SnapshotBackstackManager of the SDK. Typing in one block is grouped: a snapshot is taken on
 * the first edit, then once every [textEditLimit] edits or after a pause, so one undo takes
 * back a few words rather than one letter. Snapshots share the blocks that did not change.
 */

export type Snapshot = {
  order: string[];
  blocks: Record<string, Block>;
  focus: Caret | null;
};

const TEXT_EDIT_LIMIT = 7;
const LIMIT = 200;
/** A pause in the typing longer than this starts a new group. */
const PAUSE_MS = 1_000;

export class History {
  private back: Snapshot[] = [];
  private forward: Snapshot[] = [];
  private lastTextId: string | null = null;
  private textEdits = 0;
  private lastTextAt = 0;

  get canUndo(): boolean {
    return this.back.length > 0;
  }

  get canRedo(): boolean {
    return this.forward.length > 0;
  }

  /** Remembers [snapshot], the document right before a change of structure. */
  push(snapshot: Snapshot) {
    this.endTyping();
    this.add(snapshot);
  }

  /** Remembers [snapshot], the document right before text typed in block [id]. */
  pushTyping(snapshot: Snapshot, id: string, now: number = Date.now()) {
    const grouped =
      id === this.lastTextId &&
      this.textEdits < TEXT_EDIT_LIMIT &&
      now - this.lastTextAt < PAUSE_MS;
    this.lastTextAt = now;
    if (grouped) {
      this.textEdits++;
      return;
    }
    this.lastTextId = id;
    this.textEdits = 1;
    this.add(snapshot);
  }

  /** The snapshot to go back to from [current], which becomes the one to redo. */
  undo(current: Snapshot): Snapshot | null {
    let snapshot = this.back.pop();
    while (snapshot && sameContent(snapshot, current)) snapshot = this.back.pop();
    if (!snapshot) return null;
    this.forward.push(current);
    this.endTyping();
    return snapshot;
  }

  redo(current: Snapshot): Snapshot | null {
    const snapshot = this.forward.pop();
    if (!snapshot) return null;
    this.back.push(current);
    this.endTyping();
    return snapshot;
  }

  /**
   * Applies a change that arrived on its own (an upload ending, a description written) to
   * every snapshot holding the block, so going back in the history does not take it away.
   */
  patch(id: string, change: (block: Block) => Block) {
    const patchOne = (snapshot: Snapshot): Snapshot => {
      const position = snapshot.order.find((each) => snapshot.blocks[each]!.id === id);
      if (position === undefined) return snapshot;
      return {
        ...snapshot,
        blocks: { ...snapshot.blocks, [position]: change(snapshot.blocks[position]!) },
      };
    };
    this.back = this.back.map(patchOne);
    this.forward = this.forward.map(patchOne);
  }

  clear() {
    this.back = [];
    this.forward = [];
    this.endTyping();
  }

  /** Whatever is typed next starts a new group. */
  endTyping() {
    this.lastTextId = null;
    this.textEdits = 0;
  }

  private add(snapshot: Snapshot) {
    this.forward = [];
    const last = this.back[this.back.length - 1];
    if (last && sameContent(last, snapshot)) return;
    this.back.push(snapshot);
    if (this.back.length > LIMIT) this.back.splice(0, this.back.length - LIMIT);
  }
}

function sameContent(a: Snapshot, b: Snapshot): boolean {
  return (
    a.order.length === b.order.length &&
    a.order.every(
      (position, index) => position === b.order[index] && a.blocks[position] === b.blocks[position],
    )
  );
}
