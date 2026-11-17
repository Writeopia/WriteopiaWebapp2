import { useEffect } from "react";

import { StoryTypes } from "~/core/models";
import { newBlock } from "~/features/editor/state/blocks";
import { find } from "~/features/editor/state/reducer";
import { useEditor, useEditorStoreApi } from "~/features/editor/state/store";

import { useDrawingDialog } from "../dialogs";
import { DrawingDialog } from "./DrawingDialog";

/** The drawing dialog of the open document: a new drawing goes in, an edited one is replaced. */
export function DrawingHost() {
  const store = useEditorStoreApi();
  const target = useDrawingDialog((state) => state.target);
  const close = useDrawingDialog((state) => state.close);
  const readOnly = useEditor((editor) => editor.state.readOnly);

  // A dialog left open belongs to the document it was opened in.
  useEffect(() => close, [close]);
  useEffect(() => {
    if (readOnly) close();
  }, [readOnly, close]);

  if (!target) return null;

  const editing =
    target.kind === "edit" ? find(store.getState().state, target.blockId)?.block : undefined;
  if (target.kind === "edit" && !editing) return null;

  const save = (json: string) => {
    const { dispatch } = store.getState();
    if (target.kind === "edit") {
      dispatch({ type: "updateBlock", id: target.blockId, changes: { text: json } });
    } else {
      dispatch({
        type: "insertBlocks",
        afterId: target.afterId,
        blocks: [newBlock(StoryTypes.DRAWING, { text: json })],
      });
    }
    close();
  };

  return (
    <DrawingDialog
      key={target.kind === "edit" ? target.blockId : "new"}
      initialJson={editing?.text ?? null}
      onSave={save}
      onClose={close}
    />
  );
}
