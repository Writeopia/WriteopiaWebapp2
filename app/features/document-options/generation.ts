/**
 * The header picture the AI draws, from the request to the user's choice
 * (HeaderImagesController.kt): nothing, drawing, a picture to use or draw again, or a failure.
 * A picture being used is also kept with the pictures of the workspace; while that runs it is
 * [saving], and [saveFailed] when the workspace did not keep it.
 */
export type Generation =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "generated"; url: string; saving: boolean; saveFailed: boolean }
  | { kind: "failed"; message: string | null };

export type GenerationAction =
  | { type: "start" }
  | { type: "succeeded"; url: string }
  | { type: "failed"; message: string | null }
  | { type: "discard" }
  | { type: "saving" }
  | { type: "saved"; url: string }
  | { type: "saveFailed"; url: string };

const IDLE: Generation = { kind: "idle" };

export function generationReducer(state: Generation, action: GenerationAction): Generation {
  switch (action.type) {
    case "start":
      return state.kind === "generating" ? state : { kind: "generating" };
    case "succeeded":
      // Discarded while drawing: the answer is dropped.
      return state.kind === "generating"
        ? { kind: "generated", url: action.url, saving: false, saveFailed: false }
        : state;
    case "failed":
      return state.kind === "generating" ? { kind: "failed", message: action.message } : state;
    case "discard":
      return IDLE;
    case "saving":
      return state.kind === "generated" ? { ...state, saving: true, saveFailed: false } : state;
    case "saved":
      return state.kind === "generated" && state.url === action.url ? IDLE : state;
    case "saveFailed":
      return state.kind === "generated" && state.url === action.url
        ? { ...state, saving: false, saveFailed: true }
        : state;
  }
}
