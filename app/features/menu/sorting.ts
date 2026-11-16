import type { MenuEntry, OrderBy } from "./model";
import { entryTitle } from "./model";

function createdAt(entry: MenuEntry): number {
  return entry.kind === "folder" ? entry.folder.createdAt : entry.document.createdAt;
}

function lastUpdatedAt(entry: MenuEntry): number {
  return entry.kind === "folder" ? entry.folder.lastUpdatedAt : entry.document.lastUpdatedAt;
}

function compare(orderBy: OrderBy): (a: MenuEntry, b: MenuEntry) => number {
  switch (orderBy) {
    case "title":
      return (a, b) =>
        entryTitle(a).localeCompare(entryTitle(b), undefined, { sensitivity: "base" });
    case "created_at":
      return (a, b) => createdAt(b) - createdAt(a);
    case "last_updated_at":
      return (a, b) => lastUpdatedAt(b) - lastUpdatedAt(a);
  }
}

/**
 * The entries in the order the menu shows them: folders first, then documents, each group by
 * [orderBy] — names from A to Z, dates from the newest. Entries that tie keep their order.
 */
export function sortEntries(entries: readonly MenuEntry[], orderBy: OrderBy): MenuEntry[] {
  const order = compare(orderBy);
  const folders = entries.filter((entry) => entry.kind === "folder").sort(order);
  const documents = entries.filter((entry) => entry.kind === "document").sort(order);
  return [...folders, ...documents];
}

export function parseOrderBy(value: string | null | undefined): OrderBy {
  return value === "title" || value === "created_at" ? value : "last_updated_at";
}
