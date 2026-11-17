import { describe, expect, it } from "vitest";

import { addStroke, clearStrokes, redo, startHistory, undo } from "./history";
import {
  BLACK,
  DRAWING_COLORS,
  drawingBounds,
  type DrawingData,
  emptyDrawing,
  kotlinFloat,
  parseDrawing,
  serializeDrawing,
  type Stroke,
} from "./model";

/**
 * What kotlinx.serialization writes for a drawing made on Android (the fixture of
 * DrawingTests.swift): default values are left out and colors are signed ARGB integers.
 */
const KOTLIN_JSON =
  '{"id":"d1","strokes":[' +
  '{"id":"s1","points":[{"x":10.0,"y":20.0},{"x":30.5,"y":40.0,"pressure":0.5,"timestamp":1700}]},' +
  '{"id":"s2","points":[{"x":0.0,"y":0.0}],"color":-65536,"strokeWidth":8.0,"tool":"HIGHLIGHTER"}' +
  '],"width":400,"height":600}';

function aStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: "s",
    points: [{ x: 1, y: 2, pressure: 1, timestamp: 0 }],
    color: BLACK,
    strokeWidth: 4,
    tool: "PEN",
    ...overrides,
  };
}

describe("the drawing JSON", () => {
  it("reads a drawing made by the other apps, with their defaults", () => {
    const drawing = parseDrawing(KOTLIN_JSON)!;

    expect(drawing.width).toBe(400);
    expect(drawing.height).toBe(600);
    expect(drawing.backgroundColor).toBeNull();
    expect(drawing.strokes[0]).toEqual({
      id: "s1",
      points: [
        { x: 10, y: 20, pressure: 1, timestamp: 0 },
        { x: 30.5, y: 40, pressure: 0.5, timestamp: 1700 },
      ],
      color: BLACK,
      strokeWidth: 4,
      tool: "PEN",
    });
    expect(drawing.strokes[1]).toMatchObject({
      color: -65536,
      strokeWidth: 8,
      tool: "HIGHLIGHTER",
    });
  });

  it("writes it back byte for byte", () => {
    expect(serializeDrawing(parseDrawing(KOTLIN_JSON)!)).toBe(KOTLIN_JSON);
  });

  it("leaves out what has its default, like kotlinx.serialization", () => {
    const drawing: DrawingData = {
      id: "d",
      strokes: [aStroke({ color: DRAWING_COLORS[4]!, strokeWidth: 12, tool: "ERASER" })],
      width: 100,
      height: 200,
      backgroundColor: null,
    };

    expect(serializeDrawing(drawing)).toBe(
      '{"id":"d","strokes":[{"id":"s","points":[{"x":1.0,"y":2.0}],"color":-16776961,"strokeWidth":12.0,"tool":"ERASER"}],"width":100,"height":200}',
    );
    expect(serializeDrawing({ ...emptyDrawing(), id: "e" })).toBe('{"id":"e"}');
  });

  it("is not a drawing when it is not JSON or not an object", () => {
    expect(parseDrawing("not json")).toBeNull();
    expect(parseDrawing("[1]")).toBeNull();
    expect(parseDrawing("")).toBeNull();
    expect(parseDrawing(null)).toBeNull();
  });

  it("prints floats the way Kotlin does", () => {
    expect(kotlinFloat(4)).toBe("4.0");
    expect(kotlinFloat(30.5)).toBe("30.5");
    expect(kotlinFloat(0.1)).toBe("0.1");
    expect(kotlinFloat(123.4)).toBe("123.4");
    expect(kotlinFloat(-2)).toBe("-2.0");
    expect(kotlinFloat(0)).toBe("0.0");
    expect(kotlinFloat(0.0001)).toBe("1.0E-4");
    expect(kotlinFloat(12_345_678)).toBe("1.2345678E7");
  });

  it("has the colors of the other apps as signed integers", () => {
    expect(DRAWING_COLORS).toHaveLength(11);
    expect(DRAWING_COLORS[0]).toBe(BLACK);
    expect(DRAWING_COLORS[1]).toBe(-1);
  });
});

describe("the bounds of a drawing", () => {
  it("cover the points with the preview's padding", () => {
    const drawing = {
      ...emptyDrawing(),
      strokes: [
        aStroke({
          points: [
            { x: 100, y: 50, pressure: 1, timestamp: 0 },
            { x: 200, y: 150, pressure: 1, timestamp: 0 },
          ],
        }),
        aStroke({ points: [{ x: 120, y: 300, pressure: 1, timestamp: 0 }] }),
      ],
    };

    expect(drawingBounds(drawing)).toEqual({ left: 60, top: 10, width: 180, height: 330 });
    expect(drawingBounds(emptyDrawing())).toBeNull();
  });
});

describe("the history of a drawing", () => {
  it("undoes and redoes strokes and the clear", () => {
    let history = startHistory(emptyDrawing(300, 200));
    history = addStroke(history, aStroke({ id: "a" }));
    history = addStroke(history, aStroke({ id: "b" }));
    history = clearStrokes(history);
    expect(history.drawing.strokes).toEqual([]);

    history = undo(history);
    expect(history.drawing.strokes.map((stroke) => stroke.id)).toEqual(["a", "b"]);
    history = undo(history);
    expect(history.drawing.strokes.map((stroke) => stroke.id)).toEqual(["a"]);
    history = redo(history);
    expect(history.drawing.strokes.map((stroke) => stroke.id)).toEqual(["a", "b"]);

    // A new stroke drops what could be redone.
    history = addStroke(history, aStroke({ id: "c" }));
    expect(redo(history)).toBe(history);
    expect(history.drawing.width).toBe(300);
  });

  it("does nothing to undo at the start", () => {
    const history = startHistory(emptyDrawing());
    expect(undo(history)).toBe(history);
    expect(clearStrokes(history)).toBe(history);
  });
});
