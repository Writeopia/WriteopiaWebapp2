import { z } from "zod";

import { AI_TIMEOUT_MS, api, ApiError } from "~/core/api";

const equationSchema = z.object({
  latex: z.string().nullish(),
  imageUrl: z.string().nullish(),
  error: z.string().nullish(),
});

export type Equation = { latex: string; imageUrl: string };

/** Why a drawing could not become an equation: the backend's reason, when it gave one. */
export class EquationError extends Error {
  override readonly name = "EquationError";
}

/**
 * The cloud AI reads the equation written in a drawing (EquationRouting.kt): the backend draws
 * the strokes into a picture for the model and answers the LaTeX and a picture of it.
 */
export async function recognizeEquation(
  drawingJson: string,
  signal?: AbortSignal,
): Promise<Equation> {
  try {
    const response = await api.post(
      "/ai/equation/recognize",
      { drawing: drawingJson },
      equationSchema,
      {
        signal,
        timeoutMs: AI_TIMEOUT_MS,
      },
    );
    if (!response.latex || !response.imageUrl) {
      throw new EquationError(response.error ?? "The AI read no equation");
    }
    return { latex: response.latex, imageUrl: response.imageUrl };
  } catch (error) {
    if (error instanceof ApiError) {
      let reason: string | null = null;
      try {
        const body = JSON.parse(error.body) as { error?: unknown };
        if (typeof body.error === "string") reason = body.error;
      } catch {
        // Not JSON: no reason to show.
      }
      throw new EquationError(reason ?? error.message, { cause: error });
    }
    throw error;
  }
}
