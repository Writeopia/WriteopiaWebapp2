import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type StoryStep, StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";

import { aStep } from "../../../../test/fixtures";
import type { StepSyncRequest, StepSyncResponse } from "../api";
import type { Block } from "../state/types";
import { StepSync, type SyncStatus } from "./stepSync";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const title = aStep({
  id: "title",
  type: StoryTypes.TITLE,
  text: "T",
  position: rankAt(0),
  lastUpdatedAt: 50,
});
const line = aStep({ id: "a", text: "a", position: rankAt(1), lastUpdatedAt: 80 });

function setup(
  answer: (request: StepSyncRequest) => Promise<StepSyncResponse> = () =>
    Promise.resolve({ serverTimestamp: 1_000, updatedSteps: [], deletedIds: [] }),
  /** What the editor does with the steps changed elsewhere. */
  apply: (sync: StepSync, steps: StoryStep[]) => void = () => undefined,
) {
  const requests: StepSyncRequest[] = [];
  const statuses: SyncStatus[] = [];
  const updates: [StoryStep[], string[], ReadonlySet<string>][] = [];
  const sync = new StepSync(
    {
      documentId: "doc",
      workspaceId: "ws",
      send: (request) => {
        requests.push(request);
        return answer(request);
      },
      onServerUpdate: (steps, deleted, keep) => {
        updates.push([steps, deleted, keep]);
        apply(sync, steps);
      },
      onStatus: (status) => statuses.push(status),
      now: () => 500,
    },
    [title, line],
  );
  return { sync, requests, statuses, updates };
}

describe("StepSync", () => {
  it("deletes nothing when flushed before any update", async () => {
    const { sync, requests } = setup();
    await sync.flush();
    await vi.runAllTimersAsync();
    expect(requests).toEqual([]);
    expect(sync.hasUnsaved()).toBe(false);
  });

  it("sends nothing while nothing changed", async () => {
    const { sync, requests } = setup();
    sync.update([title, line]);
    await vi.runAllTimersAsync();
    expect(requests).toEqual([]);
  });

  it("sends the changed steps after 500 ms of quiet, stamped", async () => {
    const { sync, requests, statuses } = setup();
    sync.update([title, { ...line, text: "ab" }]);
    await vi.advanceTimersByTimeAsync(300);
    sync.update([title, { ...line, text: "abc" }]);
    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      documentId: "doc",
      workspaceId: "ws",
      lastSyncTimestamp: 80,
      requestTimestamp: 500,
      deletions: [],
    });
    expect(requests[0]!.changes).toEqual([
      { position: rankAt(1), storyStep: { ...line, text: "abc", lastUpdatedAt: 500 } },
    ]);
    expect(statuses).toEqual(["pending", "saving", "saved"]);
  });

  it("sends deletions and moves, and never what only this screen has", async () => {
    const { sync, requests } = setup();
    const uploading: Block = { ...aStep({ id: "img", type: StoryTypes.IMAGE }), ephemeral: true };
    sync.update([{ ...title, position: rankAt(0) }, uploading]);
    await vi.runAllTimersAsync();
    expect(requests[0]!.deletions).toEqual(["a"]);
    expect(requests[0]!.changes).toEqual([]);

    sync.update([{ ...title, position: rankAt(5) }]);
    await vi.runAllTimersAsync();
    expect(requests[1]!.changes.map((change) => change.position)).toEqual([rankAt(5)]);
    expect(requests[1]!.lastSyncTimestamp).toBe(1_000);
  });

  it("hands the changes made elsewhere to the editor and does not send them back", async () => {
    const remote = aStep({ id: "b", text: "remote", position: rankAt(2) });
    const { sync, requests, updates } = setup(
      () => Promise.resolve({ serverTimestamp: 1_000, updatedSteps: [remote], deletedIds: ["x"] }),
      (self, steps) => self.update([title, { ...line, text: "ab" }, ...steps]),
    );
    sync.update([title, { ...line, text: "ab" }]);
    await vi.runAllTimersAsync();
    expect(updates).toEqual([[[remote], ["x"], new Set()]]);

    sync.update([title, { ...line, text: "ab" }, remote]);
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(1);
  });

  it("retries, then gives up after three failures until asked again", async () => {
    let fail = true;
    const { sync, requests, statuses } = setup(() =>
      fail
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ serverTimestamp: 1_000, updatedSteps: [], deletedIds: [] }),
    );
    sync.update([title, { ...line, text: "ab" }]);
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(3);
    expect(statuses[statuses.length - 1]).toBe("failed");
    expect(sync.hasUnsaved()).toBe(true);

    fail = false;
    await sync.retry();
    expect(requests).toHaveLength(4);
    expect(statuses[statuses.length - 1]).toBe("saved");
    expect(sync.hasUnsaved()).toBe(false);
  });

  it("sends at once on flush, and what changed during a request right after it", async () => {
    let release: () => void = () => undefined;
    const { sync, requests } = setup(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ serverTimestamp: 1_000, updatedSteps: [], deletedIds: [] });
        }),
    );
    sync.update([title, { ...line, text: "ab" }]);
    const flushed = sync.flush();
    expect(requests).toHaveLength(1);

    sync.update([title, { ...line, text: "abc" }]);
    expect(sync.unsavedIds()).toEqual(new Set(["a"]));
    release();
    await flushed;
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.changes[0]!.storyStep.text).toBe("abc");
  });

  it("lets a step changed elsewhere replace the one here when it was not edited here", async () => {
    const remoteLine = { ...line, text: "from elsewhere" };
    let answered = false;
    const { sync, requests, updates } = setup(
      () => {
        const updatedSteps = answered ? [] : [remoteLine];
        answered = true;
        return Promise.resolve({ serverTimestamp: 1_000, updatedSteps, deletedIds: [] });
      },
      (self, steps) => self.update([{ ...title, text: "T2" }, ...steps]),
    );
    sync.update([{ ...title, text: "T2" }, line]);
    await vi.runAllTimersAsync();

    expect(updates[0]![2]).toEqual(new Set());
    expect(requests).toHaveLength(1);
    expect(sync.hasUnsaved()).toBe(false);
  });

  it("keeps a step edited here while the request was out, and sends it next", async () => {
    let release: () => void = () => undefined;
    let first = true;
    const { sync, requests, updates } = setup(() => {
      if (!first)
        return Promise.resolve({ serverTimestamp: 2_000, updatedSteps: [], deletedIds: [] });
      first = false;
      return new Promise((resolve) => {
        release = () =>
          resolve({
            serverTimestamp: 1_000,
            updatedSteps: [{ ...line, text: "remote" }],
            deletedIds: [],
          });
      });
    });
    sync.update([{ ...title, text: "T2" }, line]);
    const flushed = sync.flush();
    sync.update([
      { ...title, text: "T2" },
      { ...line, text: "local" },
    ]);
    release();
    await flushed;

    expect(updates[0]![2]).toEqual(new Set(["a"]));
    await vi.runAllTimersAsync();
    expect(requests[1]!.changes.map((change) => change.storyStep.text)).toEqual(["local"]);
  });
});
