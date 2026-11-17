import type { StoryStep } from "~/core/models";

import type { StepSyncRequest, StepSyncResponse } from "../api";
import { contentOf, toStep } from "../state/reducer";
import type { Block } from "../state/types";

/**
 * Keeps the backend up to date with the steps of the open document, like
 * OnUpdateStoryStepSyncTracker and StoryStepSyncBuffer of the SDK: changes wait 500 ms of
 * quiet, then the steps whose content changed go in one request, with the ids of the deleted
 * ones. Instead of following each kind of edit, it compares the blocks with what the server
 * was last known to hold, so no edit can be missed and an edit made while a request is out is
 * simply sent by the next one.
 */

export type SyncStatus =
  /** Everything is on the server. */
  | "saved"
  /** Changes wait for the quiet time or for the request out. */
  | "pending"
  | "saving"
  /** Three requests in a row failed; the changes stay until a retry. */
  | "failed";

type Known = { position: string; key: string };

export type StepSyncOptions = {
  documentId: string;
  workspaceId: string;
  send: (request: StepSyncRequest) => Promise<StepSyncResponse>;
  /**
   * Steps changed and deleted elsewhere, to show in the editor, but not over the blocks in
   * [keepIds]: they have changes not sent yet.
   */
  onServerUpdate: (steps: StoryStep[], deletedIds: string[], keepIds: ReadonlySet<string>) => void;
  onStatus: (status: SyncStatus) => void;
  debounceMs?: number;
  maxFailures?: number;
  now?: () => number;
};

const keys = new WeakMap<Block, string>();

/** What is compared: the content and the position of a step. */
function keyOf(step: Block | StoryStep, position: string): string {
  const cached = keys.get(step);
  if (cached !== undefined && step.position === position) return cached;
  const key = JSON.stringify([position, contentOf(step)]);
  keys.set(step, key);
  return key;
}

export class StepSync {
  private readonly options: Required<StepSyncOptions>;
  /** What the server holds, by step id. */
  private known = new Map<string, Known>();
  private blocks: Block[] = [];
  private lastSyncTimestamp: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private status: SyncStatus = "saved";
  private stopped = false;

  constructor(options: StepSyncOptions, loaded: readonly StoryStep[]) {
    this.options = { debounceMs: 500, maxFailures: 3, now: Date.now, ...options };
    for (const step of loaded) {
      this.known.set(step.id, { position: step.position, key: keyOf(step, step.position) });
    }
    // The server refuses to delete a step changed after this time, so it starts at the
    // newest step the editor has seen rather than at 0.
    this.lastSyncTimestamp = Math.max(0, ...loaded.map((step) => step.lastUpdatedAt ?? 0));
  }

  /** The blocks of the document changed; they are sent after the quiet time. */
  update(blocks: Block[]) {
    if (this.stopped) return;
    this.blocks = blocks;
    const { changes, deletions } = this.changes();
    if (changes.length === 0 && deletions.length === 0) {
      if (!this.inFlight && this.status !== "failed") this.setStatus("saved");
      return;
    }
    if (this.status !== "failed") this.setStatus(this.inFlight ? "saving" : "pending");
    this.schedule(this.options.debounceMs);
  }

  /** Sends what waits now, without the quiet time: when the page is hidden or closed. */
  flush(): Promise<void> {
    this.clearTimer();
    return this.run();
  }

  /** After a failure: tries again at once. */
  retry(): Promise<void> {
    this.failures = 0;
    this.setStatus("pending");
    return this.flush();
  }

  /** Whether something is not on the server yet. */
  hasUnsaved(): boolean {
    const { changes, deletions } = this.changes();
    return changes.length > 0 || deletions.length > 0 || this.inFlight !== null;
  }

  /** The ids of the blocks changed here and not sent yet: they win over the server's. */
  unsavedIds(): Set<string> {
    return new Set(this.changes().changes.map((change) => change.storyStep.id));
  }

  stop() {
    this.stopped = true;
    this.clearTimer();
  }

  private changes(): Pick<StepSyncRequest, "changes" | "deletions"> {
    const present = new Set<string>();
    const changes: StepSyncRequest["changes"] = [];

    for (const block of this.blocks) {
      if (block.ephemeral) continue;
      present.add(block.id);
      const known = this.known.get(block.id);
      if (known?.key !== keyOf(block, block.position)) {
        changes.push({ storyStep: toStep(block), position: block.position });
      }
    }

    const deletions = [...this.known.keys()].filter((id) => !present.has(id));
    return { changes, deletions };
  }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      return this.stopped ? undefined : this.run();
    }

    const { changes, deletions } = this.changes();
    if (changes.length === 0 && deletions.length === 0) {
      this.setStatus("saved");
      return;
    }

    this.inFlight = this.send(changes, deletions);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async send(changes: StepSyncRequest["changes"], deletions: string[]) {
    this.setStatus("saving");
    const requestTimestamp = this.options.now();
    const stamped = changes.map((change) => ({
      ...change,
      storyStep: { ...change.storyStep, lastUpdatedAt: requestTimestamp },
    }));

    let response: StepSyncResponse;
    try {
      response = await this.options.send({
        documentId: this.options.documentId,
        workspaceId: this.options.workspaceId,
        lastSyncTimestamp: this.lastSyncTimestamp,
        requestTimestamp,
        changes: stamped,
        deletions,
      });
    } catch {
      if (this.stopped) return;
      this.failures++;
      if (this.failures >= this.options.maxFailures) {
        this.setStatus("failed");
      } else {
        this.setStatus("pending");
        this.schedule(this.options.debounceMs * 2 ** this.failures);
      }
      return;
    }

    this.failures = 0;
    this.lastSyncTimestamp = response.serverTimestamp;
    for (const change of changes) {
      this.known.set(change.storyStep.id, {
        position: change.position,
        key: JSON.stringify([change.position, contentOf(change.storyStep)]),
      });
    }
    for (const id of deletions) this.known.delete(id);

    // What changed elsewhere goes to the editor, except over the blocks edited here while
    // the request was out: those win and are sent next.
    const keep = this.unsavedIds();
    for (const step of response.updatedSteps) {
      if (keep.has(step.id)) continue;
      this.known.set(step.id, { position: step.position, key: keyOf(step, step.position) });
    }
    for (const id of response.deletedIds) {
      if (!keep.has(id)) this.known.delete(id);
    }
    if (!this.stopped && (response.updatedSteps.length > 0 || response.deletedIds.length > 0)) {
      this.options.onServerUpdate(response.updatedSteps, response.deletedIds, keep);
    }

    if (this.stopped) return;
    const { changes: left, deletions: leftDeletions } = this.changes();
    if (left.length > 0 || leftDeletions.length > 0) {
      this.setStatus("pending");
      this.schedule(this.options.debounceMs);
    } else {
      this.setStatus("saved");
    }
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
