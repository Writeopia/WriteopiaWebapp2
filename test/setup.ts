import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { queryClient } from "~/core/query/queryClient";
import { useToastStore } from "~/core/ui";
import { useForgotPasswordFlow, useRegisterFlow } from "~/features/auth/flows";
import { useMenuDialogs } from "~/features/menu/dialogs";
import { useDragStore } from "~/features/menu/dnd";
import { useMenuPreferences } from "~/features/menu/preferences";
import { useShellStore } from "~/features/shell/store";

import { server } from "./msw/server";

// A request no handler knows is a bug in the test, not something to let through.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  queryClient.clear();
  useRegisterFlow.getState().reset();
  useForgotPasswordFlow.getState().reset();
  useToastStore.setState({ toasts: [] });
  useMenuDialogs.getState().close();
  useDragStore.getState().end();
  useMenuPreferences.getState().reload();
  useShellStore.getState().reload();
});

afterAll(() => server.close());

// jsdom has <dialog> but not its modal methods.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

// jsdom has no matchMedia; tests that care about the system theme replace this.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
}
