import { createContext, useContext } from "react";

import type { Document, DocumentTag, Icon } from "~/core/models";

/** The dialogs around an open document. */
export type OptionsDialog =
  "header" | "icon" | "tags" | "addTag" | "publish" | "premium" | "delete" | null;

/** The fields of a document the options change, saved without its steps. */
export type DocumentChanges = Partial<Pick<Document, "icon" | "tagIds" | "isLocked">>;

/** The document around the editor, with what can be done to it. */
export type DocumentOptions = {
  /** The document as the options last changed it; its steps are the editor's, not these. */
  document: Document;
  /** The tag catalogue of the workspace. */
  catalogue: DocumentTag[];
  /** Whether the AI can be asked, for the pictures and the tags. */
  canUseAi: boolean;
  isPremium: boolean;
  change: (changes: DocumentChanges) => void;
  setIcon: (icon: Icon | null) => void;
  toggleFavorite: () => void;
  /** Moves the document; the dialog is the menu's. */
  move: () => void;
  open: (dialog: OptionsDialog) => void;
  exportMarkdown: () => void;
  exportJson: () => void;
  /** The title and the text of the document now, for the AI. */
  currentText: () => { title: string; text: string };
};

export const DocumentOptionsContext = createContext<DocumentOptions | null>(null);

export function useDocumentOptions(): DocumentOptions {
  const options = useContext(DocumentOptionsContext);
  if (!options) throw new Error("useDocumentOptions is used outside of a document");
  return options;
}
