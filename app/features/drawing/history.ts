import type { DrawingData, Stroke } from "./model";

/** The drawing being edited, with the steps to go back and forth (DrawingViewModel.kt). */
export type DrawingHistory = { drawing: DrawingData; past: DrawingData[]; future: DrawingData[] };

const MAX_STEPS = 100;

export function startHistory(drawing: DrawingData): DrawingHistory {
  return { drawing, past: [], future: [] };
}

function change(history: DrawingHistory, drawing: DrawingData): DrawingHistory {
  return { drawing, past: [...history.past, history.drawing].slice(-MAX_STEPS), future: [] };
}

export function addStroke(history: DrawingHistory, stroke: Stroke): DrawingHistory {
  return change(history, { ...history.drawing, strokes: [...history.drawing.strokes, stroke] });
}

export function clearStrokes(history: DrawingHistory): DrawingHistory {
  if (history.drawing.strokes.length === 0) return history;
  return change(history, { ...history.drawing, strokes: [] });
}

export function resize(history: DrawingHistory, width: number, height: number): DrawingHistory {
  return { ...history, drawing: { ...history.drawing, width, height } };
}

export function undo(history: DrawingHistory): DrawingHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    drawing: { ...previous, width: history.drawing.width, height: history.drawing.height },
    past: history.past.slice(0, -1),
    future: [history.drawing, ...history.future],
  };
}

export function redo(history: DrawingHistory): DrawingHistory {
  const [next, ...future] = history.future;
  if (!next) return history;
  return { drawing: next, past: [...history.past, history.drawing], future };
}
