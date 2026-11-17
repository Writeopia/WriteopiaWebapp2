import { argbCss, type Stroke } from "./model";

/** A highlighter is drawn three times wider, at 40 % (DrawingPreviewDrawer.kt). */
const HIGHLIGHTER_WIDTH_FACTOR = 3;
const HIGHLIGHTER_ALPHA = 0.4;

export type Transform = { scale: number; offsetX: number; offsetY: number };
export const IDENTITY: Transform = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Draws [strokes] on a transparent layer. The eraser takes out what is under it, so the layer
 * sits on any background — the other apps paint it in the background color instead.
 */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  transform: Transform = IDENTITY,
): void {
  for (const stroke of strokes) drawStroke(context, stroke, transform);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  { scale, offsetX, offsetY }: Transform = IDENTITY,
): void {
  const [first, ...rest] = stroke.points;
  if (!first) return;

  const highlighter = stroke.tool === "HIGHLIGHTER";
  context.globalCompositeOperation = stroke.tool === "ERASER" ? "destination-out" : "source-over";
  context.strokeStyle =
    stroke.tool === "ERASER" ? "#000" : argbCss(stroke.color, highlighter ? HIGHLIGHTER_ALPHA : 1);
  context.fillStyle = context.strokeStyle;
  context.lineWidth = stroke.strokeWidth * scale * (highlighter ? HIGHLIGHTER_WIDTH_FACTOR : 1);
  context.lineCap = "round";
  context.lineJoin = "round";

  const x = (value: number) => value * scale + offsetX;
  const y = (value: number) => value * scale + offsetY;

  // A tap leaves a dot.
  if (rest.length === 0) {
    context.beginPath();
    context.arc(x(first.x), y(first.y), context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(x(first.x), y(first.y));
  for (const point of rest) context.lineTo(x(point.x), y(point.y));
  context.stroke();
}
