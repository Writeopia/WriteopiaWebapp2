import { Pencil, Sigma } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { t } from "~/core/i18n";
import { StoryTypes } from "~/core/models";
import { showToast, Spinner } from "~/core/ui";
import { useEditor } from "~/features/editor/state/store";
import type { Block } from "~/features/editor/state/types";

import { EquationError, recognizeEquation } from "../api";
import { useDrawingDialog } from "../dialogs";
import { drawingBounds, isEmptyDrawing, parseDrawing } from "../model";
import { drawStrokes } from "../render";

const PREVIEW_HEIGHT = 200;

/**
 * A drawing in the document (DrawingPreviewDrawer.kt): its strokes fitted to the width of the
 * page. While the document can be edited, it opens in the drawing dialog or becomes the
 * equation the AI reads in it.
 */
export function DrawingBlock({ block, readOnly }: { block: Block; readOnly: boolean }) {
  const dispatch = useEditor((store) => store.dispatch);
  const openDialog = useDrawingDialog((state) => state.open);
  const [converting, setConverting] = useState(false);
  const drawing = useMemo(() => parseDrawing(block.text), [block.text]);
  const empty = !drawing || isEmptyDrawing(drawing);

  const convert = () => {
    const json = block.text;
    if (!json || converting) return;
    setConverting(true);
    recognizeEquation(json)
      .then((equation) =>
        dispatch({
          type: "updateBlock",
          id: block.id,
          changes: { type: StoryTypes.EQUATION, text: equation.latex, url: equation.imageUrl },
        }),
      )
      .catch((error: unknown) =>
        showToast(
          error instanceof EquationError && error.message
            ? t("drawingEquationFailedReason", { reason: error.message })
            : t("drawingEquationFailed"),
          { kind: "error" },
        ),
      )
      .finally(() => setConverting(false));
  };

  return (
    <figure className="group/drawing relative my-1 rounded-md border border-card-border">
      {empty ? (
        <div className="flex h-24 items-center justify-center text-sm text-text-lighter">
          {t("drawingEmpty")}
        </div>
      ) : (
        <DrawingPreview json={block.text ?? ""} />
      )}

      {!readOnly && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-focus-within/drawing:opacity-100 group-hover/drawing:opacity-100">
          <button
            type="button"
            onClick={() => openDialog({ kind: "edit", blockId: block.id })}
            className="flex items-center gap-1 rounded-md bg-card-bg px-2 py-1 text-xs shadow hover:bg-options-selector"
          >
            <Pencil size={12} aria-hidden />
            {t("drawingEdit")}
          </button>
          <button
            type="button"
            disabled={empty || converting}
            onClick={convert}
            className="flex items-center gap-1 rounded-md bg-card-bg px-2 py-1 text-xs shadow hover:bg-options-selector disabled:opacity-50"
          >
            <Sigma size={12} aria-hidden />
            {t("drawingToEquation")}
          </button>
        </div>
      )}

      {converting && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-card-bg/70 text-sm">
          <Spinner label={t("drawingReadingEquation")} />
          {t("drawingReadingEquation")}
        </div>
      )}
    </figure>
  );
}

/** The strokes scaled to fit, centred, with the room around them the other apps leave. */
export function DrawingPreview({
  json,
  height = PREVIEW_HEIGHT,
}: {
  json: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useMemo(() => parseDrawing(json), [json]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const bounds = drawing && drawingBounds(drawing);
    if (!canvas || !context || !drawing || !bounds) return;

    // A canvas not laid out yet measures 0: its figure gives the width then.
    const width =
      canvas.clientWidth > 0 ? canvas.clientWidth : (canvas.parentElement?.clientWidth ?? 0);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const scale = Math.min(width / bounds.width, height / bounds.height);
    drawStrokes(context, drawing.strokes, {
      scale,
      offsetX: (width - bounds.width * scale) / 2 - bounds.left * scale,
      offsetY: (height - bounds.height * scale) / 2 - bounds.top * scale,
    });
  }, [drawing, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t("drawing")}
      className="block w-full"
      style={{ height }}
    />
  );
}
