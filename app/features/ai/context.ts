import { createContext, useContext } from "react";

import type { QuickAction } from "./api";
import type { QuickActionTarget } from "./runner";

/** Whether the AI can be asked: a FREE user is offered premium, an AI-less backend says so. */
export type AiAvailability = "ready" | "premium" | "unavailable";

/** The AI of an open document. */
export type AiControls = {
  availability: AiAvailability;
  /** Why the AI cannot be asked, for the buttons that ask it; null when it can. */
  reason: string | null;
  /** True while a request runs. */
  busy: boolean;
  commandOpen: boolean;
  /** Opens the command field; offers premium to a FREE user. */
  openCommand: () => void;
  closeCommand: () => void;
  runCommand: (command: string) => void;
  runQuickAction: (action: QuickAction, target: QuickActionTarget) => void;
  /** Runs other work of the AI, with the same failures and the same Stop. */
  run: (work: (signal: AbortSignal) => Promise<void>) => void;
  stop: () => void;
};

export const AiContext = createContext<AiControls | null>(null);

export function useAi(): AiControls {
  const controls = useContext(AiContext);
  if (!controls) throw new Error("useAi is used outside of a document");
  return controls;
}

export const aiKeys = {
  usage: ["ai", "usage"] as const,
};
