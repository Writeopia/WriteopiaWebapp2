import { createContext, useContext } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import { History, type Snapshot } from "./history";
import { type Action, emptyState, reducer } from "./reducer";
import type { EditorState } from "./types";

/**
 * The state of one open editor: the document (through the reducer), its history, and what
 * the screen around it shows (the search, the uploads). One store per editor, handed down by
 * a context, so two editors never share a document.
 */

export type DispatchOptions = {
  /**
   * False for changes that arrive on their own (an upload finishing, a change from the
   * backend): an undo goes back past them to what the writer did.
   */
  history?: boolean;
};

export type SearchState = { open: boolean; query: string; index: number };

export type EditorStore = {
  state: EditorState;
  canUndo: boolean;
  canRedo: boolean;
  search: SearchState;
  /** Image blocks being uploaded: their id and a local address of the picture meanwhile. */
  uploading: ReadonlyMap<string, string>;
  /** Link cards whose description is being written, by id. */
  describing: ReadonlySet<string>;
  dispatch: (action: Action, options?: DispatchOptions) => void;
  undo: () => void;
  redo: () => void;
  setSearch: (search: Partial<SearchState>) => void;
  setUploading: (id: string, preview: string | null) => void;
  setDescribing: (id: string, describing: boolean) => void;
};

function snapshot(state: EditorState): Snapshot {
  return { order: state.order, blocks: state.blocks, focus: state.focus };
}

function toggled(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  if (set.has(id) === on) return set;
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function createEditorStore(initial: EditorState = emptyState): StoreApi<EditorStore> {
  const history = new History();

  return createStore<EditorStore>((set, get) => {
    const restore = (to: Snapshot) => {
      const { state } = get();
      set({
        state: {
          ...state,
          order: to.order,
          blocks: to.blocks,
          focus: to.focus,
          focusRequest: state.focusRequest + 1,
          selectedIds: new Set(),
          lastEdit: { kind: "structure" },
          slash: null,
        },
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      });
    };

    return {
      state: initial,
      canUndo: false,
      canRedo: false,
      search: { open: false, query: "", index: 0 },
      uploading: new Map(),
      describing: new Set(),

      dispatch: (action, { history: record = true } = {}) => {
        const { state } = get();
        const next = reducer(state, action);
        if (next === state) return;

        if (action.type === "load") {
          history.clear();
        } else if (
          record &&
          action.type !== "serverUpdate" &&
          (next.blocks !== state.blocks || next.order !== state.order)
        ) {
          if (next.lastEdit.kind === "line" && action.type === "input") {
            history.pushTyping(snapshot(state), next.lastEdit.id);
          } else {
            history.push(snapshot(state));
          }
        }
        set({ state: next, canUndo: history.canUndo, canRedo: history.canRedo });
      },

      undo: () => {
        const { state } = get();
        if (state.readOnly) return;
        const to = history.undo(snapshot(state));
        if (to) restore(to);
      },

      redo: () => {
        const { state } = get();
        if (state.readOnly) return;
        const to = history.redo(snapshot(state));
        if (to) restore(to);
      },

      setSearch: (search) => set({ search: { ...get().search, ...search } }),
      setUploading: (id, preview) => {
        const uploading = new Map(get().uploading);
        if (preview === null) uploading.delete(id);
        else uploading.set(id, preview);
        set({ uploading });
      },
      setDescribing: (id, describing) =>
        set({ describing: toggled(get().describing, id, describing) }),
    };
  });
}

export const EditorStoreContext = createContext<StoreApi<EditorStore> | null>(null);

export function useEditorStoreApi(): StoreApi<EditorStore> {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor is used outside of an editor");
  return store;
}

/** Reads from the store of the editor around the component. */
export function useEditor<T>(selector: (store: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
