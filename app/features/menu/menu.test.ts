import { describe, expect, it } from "vitest";

import { ROOT_FOLDER_ID } from "~/core/models";

import { aDocument, aFolder } from "../../../test/fixtures";
import {
  insertDocuments,
  insertFolder,
  moveEntries,
  patchDocument,
  patchFolder,
  removeEntries,
} from "./cache";
import { canDropOn } from "./dnd";
import { documentEntry, entriesOf, folderEntry } from "./model";
import { parseArrangement } from "./preferences";
import { EMPTY_SELECTION, selectionReducer } from "./selection";
import { parseOrderBy, sortEntries } from "./sorting";

const root = { kind: "folder", folderId: ROOT_FOLDER_ID } as const;

describe("sortEntries", () => {
  const entries = entriesOf({
    folders: [
      aFolder({ id: "f-old", title: "zeta", createdAt: 1, lastUpdatedAt: 9 }),
      aFolder({ id: "f-new", title: "Alpha", createdAt: 5, lastUpdatedAt: 2 }),
    ],
    documents: [
      aDocument({ id: "d-b", title: "beta", createdAt: 3, lastUpdatedAt: 30 }),
      aDocument({ id: "d-a", title: "Apple", createdAt: 7, lastUpdatedAt: 10 }),
      aDocument({ id: "d-c", title: "", createdAt: 4, lastUpdatedAt: 20 }),
    ],
    tags: [],
  });
  const ids = (orderBy: Parameters<typeof sortEntries>[1]) =>
    sortEntries(entries, orderBy).map((entry) => entry.id);

  it("puts folders first and the most recently updated on top", () => {
    expect(ids("last_updated_at")).toEqual(["f-old", "f-new", "d-b", "d-c", "d-a"]);
  });

  it("sorts by creation, newest first", () => {
    expect(ids("created_at")).toEqual(["f-new", "f-old", "d-a", "d-c", "d-b"]);
  });

  it("sorts by name without minding the case", () => {
    expect(ids("title")).toEqual(["f-new", "f-old", "d-c", "d-a", "d-b"]);
  });

  it("leaves the given list as it was", () => {
    const before = entries.map((entry) => entry.id);
    sortEntries(entries, "title");
    expect(entries.map((entry) => entry.id)).toEqual(before);
  });

  it("reads the stored choices, falling back on the defaults", () => {
    expect(parseOrderBy("title")).toBe("title");
    expect(parseOrderBy("nonsense")).toBe("last_updated_at");
    expect(parseOrderBy(null)).toBe("last_updated_at");
    expect(parseArrangement("list")).toBe("list");
    expect(parseArrangement("nonsense")).toBe("grid");
  });
});

describe("selectionReducer", () => {
  const of = (...ids: string[]) => new Set(ids);

  it("toggles one id", () => {
    const one = selectionReducer(EMPTY_SELECTION, { type: "toggle", id: "a" });
    expect(one).toEqual(of("a"));
    expect(selectionReducer(one, { type: "toggle", id: "a" })).toEqual(of());
  });

  it("sets one id selected or not", () => {
    const one = selectionReducer(of("a"), { type: "set", id: "b", selected: true });
    expect(one).toEqual(of("a", "b"));
    expect(selectionReducer(one, { type: "set", id: "a", selected: false })).toEqual(of("b"));
  });

  it("adds and replaces", () => {
    expect(selectionReducer(of("a"), { type: "add", ids: ["b", "c"] })).toEqual(of("a", "b", "c"));
    expect(selectionReducer(of("a"), { type: "replace", ids: ["b"] })).toEqual(of("b"));
  });

  it("keeps only the ids that are still listed", () => {
    expect(selectionReducer(of("a", "b"), { type: "retain", ids: ["b", "c"] })).toEqual(of("b"));
  });

  it("clears", () => {
    expect(selectionReducer(of("a"), { type: "clear" }).size).toBe(0);
  });

  it("answers the same set when nothing changes", () => {
    const selection = of("a", "b");
    expect(selectionReducer(selection, { type: "set", id: "a", selected: true })).toBe(selection);
    expect(selectionReducer(selection, { type: "add", ids: ["a"] })).toBe(selection);
    expect(selectionReducer(selection, { type: "replace", ids: ["b", "a"] })).toBe(selection);
    expect(selectionReducer(selection, { type: "retain", ids: ["a", "b", "c"] })).toBe(selection);
    expect(selectionReducer(EMPTY_SELECTION, { type: "clear" })).toBe(EMPTY_SELECTION);
  });
});

describe("cache updates", () => {
  const work = aFolder({ id: "work", title: "Work", itemCount: 1 });
  const notes = aDocument({ id: "notes", title: "Notes" });
  const inWork = aDocument({ id: "report", title: "Report", parentId: "work" });
  const contents = { folders: [work], documents: [notes], tags: [] };

  it("patches the document or the folder it is given, and nothing else", () => {
    const patched = patchDocument(contents, "notes", { isFavorite: true });
    expect(patched.documents[0]?.isFavorite).toBe(true);
    expect(patched.folders).toBe(contents.folders);
    expect(patchDocument(contents, "unknown", { isFavorite: true })).toBe(contents);

    expect(patchFolder(contents, "work", { title: "Job" }).folders[0]?.title).toBe("Job");
    expect(patchFolder(contents, "unknown", { title: "Job" })).toBe(contents);
  });

  it("removes entries from the list", () => {
    const left = removeEntries(contents, [documentEntry(notes), folderEntry(work)]);
    expect(left.documents).toEqual([]);
    expect(left.folders).toEqual([]);
  });

  it("lowers the item count of the folder that held a removed entry", () => {
    const left = removeEntries(contents, [documentEntry(inWork)]);
    expect(left.folders[0]?.itemCount).toBe(0);
    expect(left.documents).toEqual(contents.documents);
  });

  it("answers the same list when no removed entry is in it", () => {
    const elsewhere = aDocument({ id: "x", parentId: "other" });
    expect(removeEntries(contents, [documentEntry(elsewhere)])).toBe(contents);
  });

  it("adds a new document to the list of its folder only", () => {
    const added = aDocument({ id: "new", parentId: ROOT_FOLDER_ID });
    expect(insertDocuments(root, contents, [added]).documents).toHaveLength(2);
    expect(insertDocuments({ kind: "folder", folderId: "work" }, contents, [added])).toBe(contents);
    expect(insertDocuments({ kind: "favorites" }, contents, [added])).toBe(contents);
    // Listed already: not added twice.
    expect(insertDocuments(root, contents, [notes])).toBe(contents);
  });

  it("counts a new document in the card of its folder", () => {
    const added = aDocument({ id: "new", parentId: "work" });
    const next = insertDocuments(root, contents, [added]);
    expect(next.folders[0]?.itemCount).toBe(2);
    expect(next.documents).toHaveLength(1);
  });

  it("adds a new folder to the list of its parent", () => {
    const added = aFolder({ id: "new", parentId: ROOT_FOLDER_ID });
    expect(insertFolder(root, contents, added).folders).toHaveLength(2);
    expect(insertFolder({ kind: "folder", folderId: "work" }, contents, added)).toBe(contents);
  });

  it("moves a document out of its folder and into the count of the target", () => {
    const next = moveEntries(root, contents, [documentEntry(notes)], "work");
    expect(next.documents).toEqual([]);
    expect(next.folders[0]?.itemCount).toBe(2);
  });

  it("shows a moved document in the list of the target, under its new parent", () => {
    const target = { folders: [], documents: [inWork], tags: [] };
    const next = moveEntries(
      { kind: "folder", folderId: "work" },
      target,
      [documentEntry(notes)],
      "work",
    );
    expect(next.documents.map((document) => [document.id, document.parentId])).toEqual([
      ["report", "work"],
      ["notes", "work"],
    ]);
  });

  it("only changes the parent where documents are listed whatever their folder", () => {
    const next = moveEntries({ kind: "favorites" }, contents, [documentEntry(notes)], "work");
    expect(next.documents).toHaveLength(1);
    expect(next.documents[0]?.parentId).toBe("work");
  });

  it("does nothing for entries that are already in the target", () => {
    expect(moveEntries(root, contents, [documentEntry(notes)], ROOT_FOLDER_ID)).toBe(contents);
  });
});

describe("canDropOn", () => {
  const notes = documentEntry(aDocument({ id: "notes", parentId: ROOT_FOLDER_ID }));
  const work = folderEntry(aFolder({ id: "work", parentId: ROOT_FOLDER_ID }));

  it("accepts entries from another folder", () => {
    expect(canDropOn([notes], "work")).toBe(true);
  });

  it("refuses a folder on itself, entries already there, and nothing at all", () => {
    expect(canDropOn([work], "work")).toBe(false);
    expect(canDropOn([notes], ROOT_FOLDER_ID)).toBe(false);
    expect(canDropOn(null, "work")).toBe(false);
  });
});
