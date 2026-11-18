import { Eraser, Highlighter, Pen, Redo2, Trash2, Undo2 } from "lucide-react";
import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { t } from "~/core/i18n";
import { generateId } from "~/core/id";
import { Button, cn, Dialog } from "~/core/ui";

import {
  addStroke,
  clearStrokes,
  type DrawingHistory,
  redo,
  resize,
  startHistory,
  undo,
} from "../history";
import {
  argbCss,
  BLACK,
  DRAWING_COLORS,
  type DrawingTool,
  type DrawPoint,
  emptyDrawing,
  parseDrawing,
  serializeDrawing,
  type Stroke,
  STROKE_WIDTHS,
  WHITE,
} from "../model";
import { drawStroke, drawStrokes } from "../render";

const toolIcons = { PEN: Pen, HIGHLIGHTER: Highlighter, ERASER: Eraser } as const;
const toolLabels = {
  PEN: "drawingPen",
  HIGHLIGHTER: "drawingHighlighter",
  ERASER: "drawingEraser",
} as const;

/** A point kept to a tenth of a pixel: the JSON stays small and reads the same everywhere. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** White strokes on a dark page, black ones on a light page, like DrawingScreen.kt. */
function defaultColor(): number {
  return document.documentElement.dataset.theme === "dark" ? WHITE : BLACK;
}

/**
 * The drawing screen (DrawingScreen.kt, DrawingToolbar.kt): a canvas for the pointer — pen,
 * mouse or finger, with the pen's pressure kept — the tools, the colors and the widths, undo,
 * redo and clear. Saved as the DrawingData JSON of the step.
 */
export function DrawingDialog({
  initialJson,
  onSave,
  onClose,
}: {
  initialJson: string | null;
  onSave: (json: string) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<DrawingHistory>(() =>
    startHistory(parseDrawing(initialJson) ?? emptyDrawing()),
  );
  const [tool, setTool] = useState<DrawingTool>("PEN");
  const [color, setColor] = useState(defaultColor);
  const [width, setWidth] = useState(STROKE_WIDTHS[0]!);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const current = useRef<{ pointerId: number; stroke: Stroke } | null>(null);

  // The canvas takes the size of its area; the drawing keeps the size it was drawn at.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const { clientWidth, clientHeight } = area;
      if (clientWidth === 0 || clientHeight === 0) return;
      setHistory((previous) =>
        resize(
          previous,
          Math.max(previous.drawing.width, clientWidth),
          Math.max(previous.drawing.height, clientHeight),
        ),
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const redraw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const { width: w, height: h } = history.drawing;
    if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
      canvas.width = w * ratio;
      canvas.height = h * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, w, h);
    drawStrokes(context, history.drawing.strokes);
    if (current.current) drawStroke(context, current.current.stroke);
    context.globalCompositeOperation = "source-over";
  };

  useLayoutEffect(redraw);

  const pointOf = (event: PointerEvent<HTMLCanvasElement>): DrawPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: round(event.clientX - rect.left),
      y: round(event.clientY - rect.top),
      // A mouse reports 0.5 while pressed; only a pen's pressure means something.
      pressure: event.pointerType === "pen" ? Math.round(event.pressure * 100) / 100 : 1,
      timestamp: Math.round(event.timeStamp),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (current.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    current.current = {
      pointerId: event.pointerId,
      stroke: { id: generateId(), points: [pointOf(event)], color, strokeWidth: width, tool },
    };
    redraw();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drawing = current.current;
    if (drawing?.pointerId !== event.pointerId) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const points =
      coalesced.length > 0
        ? coalesced.map((each) => {
            const rect = event.currentTarget.getBoundingClientRect();
            return {
              x: round(each.clientX - rect.left),
              y: round(each.clientY - rect.top),
              pressure: each.pointerType === "pen" ? Math.round(each.pressure * 100) / 100 : 1,
              timestamp: Math.round(each.timeStamp),
            };
          })
        : [pointOf(event)];
    drawing.stroke = { ...drawing.stroke, points: [...drawing.stroke.points, ...points] };
    redraw();
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drawing = current.current;
    if (drawing?.pointerId !== event.pointerId) return;
    current.current = null;
    setHistory((previous) => addStroke(previous, drawing.stroke));
  };

  const save = () => onSave(serializeDrawing(history.drawing));

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("drawing")}
      size="lg"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save}>{t("save")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div
          role="toolbar"
          aria-label={t("drawingTools")}
          className="flex flex-wrap items-center gap-3"
        >
          <div role="radiogroup" aria-label={t("drawingTool")} className="flex gap-1">
            {(["PEN", "HIGHLIGHTER", "ERASER"] as const).map((each) => {
              const Icon = toolIcons[each];
              return (
                <button
                  key={each}
                  type="button"
                  role="radio"
                  aria-checked={tool === each}
                  aria-label={t(toolLabels[each])}
                  title={t(toolLabels[each])}
                  onClick={() => setTool(each)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md",
                    tool === each ? "bg-selected-bg text-on-bg" : "hover:bg-options-selector",
                  )}
                >
                  <Icon size={16} aria-hidden />
                </button>
              );
            })}
          </div>

          <div role="radiogroup" aria-label={t("drawingColor")} className="flex flex-wrap gap-1">
            {DRAWING_COLORS.map((each) => (
              <button
                key={each}
                type="button"
                role="radio"
                aria-checked={color === each}
                aria-label={t("drawingColorValue", {
                  value: `#${(each >>> 0).toString(16).slice(2)}`,
                })}
                onClick={() => setColor(each)}
                className={cn(
                  "size-6 rounded-full border border-card-border",
                  color === each && "ring-2 ring-accent ring-offset-1 ring-offset-card-bg",
                )}
                style={{ backgroundColor: argbCss(each) }}
              />
            ))}
          </div>

          <div role="radiogroup" aria-label={t("drawingWidth")} className="flex gap-1">
            {STROKE_WIDTHS.map((each) => (
              <button
                key={each}
                type="button"
                role="radio"
                aria-checked={width === each}
                aria-label={t("drawingWidthValue", { value: each })}
                onClick={() => setWidth(each)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  width === each ? "bg-selected-bg" : "hover:bg-options-selector",
                )}
              >
                <span
                  aria-hidden
                  className="rounded-full bg-on-bg"
                  style={{ width: each / 1.5 + 2, height: each / 1.5 + 2 }}
                />
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-1">
            <ToolButton
              label={t("undo")}
              disabled={history.past.length === 0}
              onClick={() => setHistory(undo)}
            >
              <Undo2 size={16} aria-hidden />
            </ToolButton>
            <ToolButton
              label={t("redo")}
              disabled={history.future.length === 0}
              onClick={() => setHistory(redo)}
            >
              <Redo2 size={16} aria-hidden />
            </ToolButton>
            <ToolButton
              label={t("drawingClear")}
              disabled={history.drawing.strokes.length === 0}
              onClick={() => setHistory(clearStrokes)}
            >
              <Trash2 size={16} aria-hidden />
            </ToolButton>
          </div>
        </div>

        <div
          ref={areaRef}
          className="h-[60vh] overflow-auto rounded-md border border-card-border bg-global-bg"
        >
          <canvas
            ref={canvasRef}
            aria-label={t("drawingCanvas")}
            data-strokes={history.drawing.strokes.length}
            className={cn(
              "block touch-none",
              tool === "ERASER" ? "cursor-cell" : "cursor-crosshair",
            )}
            style={{ width: history.drawing.width, height: history.drawing.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
      </div>
    </Dialog>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md hover:bg-options-selector disabled:opacity-40"
    >
      {children}
    </button>
  );
}
