import { generateId } from "~/core/id";

/**
 * A drawing, as the `DrawingData` JSON every app keeps in the text of a `drawing` step
 * (writeopia_models/.../drawing). The other apps write it with kotlinx.serialization's default
 * Json: the fields in declaration order, the fields with their default value left out, colors
 * as signed ARGB integers, and floats always with a decimal point ("4.0"). serializeDrawing
 * writes the same bytes, so a drawing saved here reads back unchanged everywhere.
 */

export type DrawingTool = "PEN" | "HIGHLIGHTER" | "ERASER";
export const DRAWING_TOOLS: readonly DrawingTool[] = ["PEN", "HIGHLIGHTER", "ERASER"];

export type DrawPoint = { x: number; y: number; pressure: number; timestamp: number };

export type Stroke = {
  id: string;
  points: DrawPoint[];
  /** Signed ARGB, like a Kotlin Int. */
  color: number;
  strokeWidth: number;
  tool: DrawingTool;
};

export type DrawingData = {
  id: string;
  strokes: Stroke[];
  width: number;
  height: number;
  backgroundColor: number | null;
};

/** 0xFF000000 as a Kotlin Int. */
export const BLACK = -16777216;
export const WHITE = -1;
export const DEFAULT_STROKE_WIDTH = 4;

/** DrawingViewModel.kt's colors, as signed ARGB. */
export const DRAWING_COLORS: readonly number[] = [
  0xff000000, 0xffffffff, 0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffff00, 0xffff00ff, 0xff00ffff,
  0xffff8000, 0xff8000ff, 0xff808080,
].map(toSignedArgb);

export const STROKE_WIDTHS: readonly number[] = [4, 8, 12, 16, 20];

export function toSignedArgb(argb: number): number {
  return argb | 0;
}

/** A CSS color for a signed ARGB integer. */
export function argbCss(argb: number, alphaFactor = 1): string {
  const value = argb >>> 0;
  const alpha = ((value >>> 24) & 0xff) / 255;
  return `rgba(${(value >>> 16) & 0xff}, ${(value >>> 8) & 0xff}, ${value & 0xff}, ${alpha * alphaFactor})`;
}

export function emptyDrawing(width = 0, height = 0): DrawingData {
  return { id: generateId(), strokes: [], width, height, backgroundColor: null };
}

// ---------------------------------------------------------------------------------------------
// Reading

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** The drawing in [json], with the defaults the other apps leave out; null when it is not one. */
export function parseDrawing(json: string | null | undefined): DrawingData | null {
  if (!json?.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const data = record(raw);

  const strokes = Array.isArray(data.strokes) ? data.strokes : [];
  return {
    id: typeof data.id === "string" ? data.id : generateId(),
    strokes: strokes.map((value): Stroke => {
      const stroke = record(value);
      const points = Array.isArray(stroke.points) ? stroke.points : [];
      return {
        id: typeof stroke.id === "string" ? stroke.id : generateId(),
        points: points.map((pointValue): DrawPoint => {
          const point = record(pointValue);
          return {
            x: numberOr(point.x, 0),
            y: numberOr(point.y, 0),
            pressure: numberOr(point.pressure, 1),
            timestamp: numberOr(point.timestamp, 0),
          };
        }),
        color: toSignedArgb(numberOr(stroke.color, BLACK)),
        strokeWidth: numberOr(stroke.strokeWidth, DEFAULT_STROKE_WIDTH),
        tool: DRAWING_TOOLS.find((tool) => tool === stroke.tool) ?? "PEN",
      };
    }),
    width: Math.trunc(numberOr(data.width, 0)),
    height: Math.trunc(numberOr(data.height, 0)),
    backgroundColor:
      typeof data.backgroundColor === "number" ? toSignedArgb(data.backgroundColor) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing

/**
 * A Float as Kotlin prints it: the shortest decimal that reads back as the same 32-bit float,
 * with ".0" on whole numbers, and in E notation below 10⁻³ or from 10⁷ on.
 */
export function kotlinFloat(value: number): string {
  const float = Math.fround(value);
  if (!Number.isFinite(float)) return "0.0";
  if (float === 0) return Object.is(float, -0) ? "-0.0" : "0.0";

  let digits = String(float);
  for (let precision = 1; precision <= 9; precision++) {
    const candidate = Number(float.toPrecision(precision));
    if (Math.fround(candidate) === float) {
      digits = String(candidate);
      break;
    }
  }

  const magnitude = Math.abs(float);
  if (magnitude >= 1e-3 && magnitude < 1e7) {
    // String() of such a number is never in E notation.
    return digits.includes(".") ? digits : `${digits}.0`;
  }

  const [mantissa = "0", exponent = "0"] = Number(digits).toExponential().split("e");
  const fixed = mantissa.includes(".") ? mantissa : `${mantissa}.0`;
  return `${fixed}E${exponent.replace("+", "")}`;
}

function field(name: string, json: string): string {
  return `${JSON.stringify(name)}:${json}`;
}

function serializePoint(point: DrawPoint): string {
  const fields = [field("x", kotlinFloat(point.x)), field("y", kotlinFloat(point.y))];
  if (Math.fround(point.pressure) !== 1)
    fields.push(field("pressure", kotlinFloat(point.pressure)));
  if (point.timestamp !== 0) fields.push(field("timestamp", String(Math.trunc(point.timestamp))));
  return `{${fields.join(",")}}`;
}

function serializeStroke(stroke: Stroke): string {
  const fields = [field("id", JSON.stringify(stroke.id))];
  if (stroke.points.length > 0) {
    fields.push(field("points", `[${stroke.points.map(serializePoint).join(",")}]`));
  }
  if (toSignedArgb(stroke.color) !== BLACK)
    fields.push(field("color", String(toSignedArgb(stroke.color))));
  if (Math.fround(stroke.strokeWidth) !== DEFAULT_STROKE_WIDTH) {
    fields.push(field("strokeWidth", kotlinFloat(stroke.strokeWidth)));
  }
  if (stroke.tool !== "PEN") fields.push(field("tool", JSON.stringify(stroke.tool)));
  return `{${fields.join(",")}}`;
}

export function serializeDrawing(drawing: DrawingData): string {
  const fields = [field("id", JSON.stringify(drawing.id))];
  if (drawing.strokes.length > 0) {
    fields.push(field("strokes", `[${drawing.strokes.map(serializeStroke).join(",")}]`));
  }
  if (drawing.width !== 0) fields.push(field("width", String(Math.trunc(drawing.width))));
  if (drawing.height !== 0) fields.push(field("height", String(Math.trunc(drawing.height))));
  if (drawing.backgroundColor !== null) {
    fields.push(field("backgroundColor", String(toSignedArgb(drawing.backgroundColor))));
  }
  return `{${fields.join(",")}}`;
}

// ---------------------------------------------------------------------------------------------
// Geometry

export type Bounds = { left: number; top: number; width: number; height: number };

/** Room left around the strokes in a preview (DrawingPreviewDrawer.kt). */
export const PREVIEW_PADDING = 40;

/** The box around every point, with the preview's padding; null for a drawing with no points. */
export function drawingBounds(drawing: DrawingData, padding = PREVIEW_PADDING): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of drawing.strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (minX === Infinity) return null;
  return {
    left: minX - padding,
    top: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function isEmptyDrawing(drawing: DrawingData): boolean {
  return drawing.strokes.every((stroke) => stroke.points.length === 0);
}
