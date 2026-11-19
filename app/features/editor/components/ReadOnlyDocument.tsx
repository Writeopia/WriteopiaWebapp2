import { useMemo, useState } from "react";

import type { Document } from "~/core/models";
import { cn } from "~/core/ui";

import { BlockContent } from "../blocks/BlockContent";
import { groupParts, rowClasses } from "../blocks/groups";
import { isTitle } from "../state/blocks";
import { ordered } from "../state/reducer";
import { createEditorStore, EditorStoreContext } from "../state/store";
import {
  type EditorActions,
  EditorActionsContext,
  type TitleFrame,
  TitleFrameContext,
} from "./editorContext";

const noop = () => undefined;

/**
 * A document drawn with the blocks of the editor, but nothing to edit, save or select: for the
 * published site. The blocks read the same store as in the editor, loaded read-only.
 */
export function ReadOnlyDocument({
  document,
  titleFrame,
  openDocument,
}: {
  document: Document;
  titleFrame?: TitleFrame;
  openDocument: (documentId: string) => void;
}) {
  const [store] = useState(() => {
    const created = createEditorStore();
    created.getState().dispatch({ type: "load", document, readOnly: true });
    return created;
  });
  const blocks = useMemo(() => ordered(store.getState().state), [store]);
  const parts = groupParts(blocks);

  const actions = useMemo<EditorActions>(
    () => ({
      insertMedia: noop,
      openLinkDialog: noop,
      addPage: noop,
      openDocument,
      askAi: noop,
      focusCanvas: noop,
    }),
    [openDocument],
  );

  return (
    <EditorStoreContext value={store}>
      <EditorActionsContext value={actions}>
        <TitleFrameContext value={titleFrame ?? null}>
          <article className="mx-auto w-full max-w-[52rem] px-6 pt-10 pb-16 sm:px-14">
            {blocks.map((block, index) => (
              <div
                key={block.id}
                data-block-id={block.id}
                className={cn(
                  "relative",
                  rowClasses(parts[index] ?? null),
                  isTitle(block) && "mb-4",
                )}
              >
                <BlockContent block={block} readOnly />
              </div>
            ))}
          </article>
        </TitleFrameContext>
      </EditorActionsContext>
    </EditorStoreContext>
  );
}
