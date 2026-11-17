import { createContext, type ReactNode, useContext } from "react";

import type { Block, Caret } from "../state/types";

/** What the blocks ask of the editor around them: the work that needs the backend or a dialog. */
export type EditorActions = {
  /** Uploads pictures and adds them as image blocks after the block with [afterId]. */
  insertImages: (files: File[], afterId?: string | null) => void;
  /** Asks for the address of a link on [caret], the selected text. */
  openLinkDialog: (caret: Caret) => void;
  /** Writes a new document next to this one and adds a link to it. */
  addPage: () => void;
  openDocument: (documentId: string) => void;
  /** The element that takes the keys while blocks are selected. */
  focusCanvas: () => void;
};

export const EditorActionsContext = createContext<EditorActions | null>(null);

export function useEditorActions(): EditorActions {
  const actions = useContext(EditorActionsContext);
  if (!actions) throw new Error("useEditorActions is used outside of an editor");
  return actions;
}

/**
 * What the screen around the editor draws around the title: the header, the icon, the tags.
 * Without one the title is drawn alone.
 */
export type TitleFrame = (props: {
  block: Block;
  readOnly: boolean;
  children: ReactNode;
}) => ReactNode;

export const TitleFrameContext = createContext<TitleFrame | null>(null);
