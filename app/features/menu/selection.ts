/** The ids of the selected entries of the menu. */
export type Selection = ReadonlySet<string>;

export type SelectionAction =
  | { type: "toggle"; id: string }
  /** Selects or unselects one entry, whatever it was. */
  | { type: "set"; id: string; selected: boolean }
  /** Adds entries to the selection: the drag box over more cards. */
  | { type: "add"; ids: readonly string[] }
  | { type: "replace"; ids: readonly string[] }
  /** Drops the ids that are no longer listed: deleted, moved away, or another folder. */
  | { type: "retain"; ids: readonly string[] }
  | { type: "clear" };

export const EMPTY_SELECTION: Selection = new Set<string>();

export function selectionReducer(selection: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case "toggle":
      return withId(selection, action.id, !selection.has(action.id));
    case "set":
      return withId(selection, action.id, action.selected);
    case "add": {
      if (action.ids.every((id) => selection.has(id))) return selection;
      return new Set([...selection, ...action.ids]);
    }
    case "replace":
      return sameIds(selection, action.ids) ? selection : new Set(action.ids);
    case "retain": {
      const listed = new Set(action.ids);
      if ([...selection].every((id) => listed.has(id))) return selection;
      return new Set([...selection].filter((id) => listed.has(id)));
    }
    case "clear":
      return selection.size === 0 ? selection : EMPTY_SELECTION;
  }
}

function withId(selection: Selection, id: string, selected: boolean): Selection {
  if (selection.has(id) === selected) return selection;

  const next = new Set(selection);
  if (selected) next.add(id);
  else next.delete(id);
  return next;
}

function sameIds(selection: Selection, ids: readonly string[]): boolean {
  return selection.size === new Set(ids).size && ids.every((id) => selection.has(id));
}
