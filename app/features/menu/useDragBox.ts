import { type PointerEvent as ReactPointerEvent, useState } from "react";

export type Box = { left: number; top: number; width: number; height: number };

/** A press that moves less than this is a click, not a box. */
const THRESHOLD = 4;

function intersects(rect: DOMRect, box: Box): boolean {
  return (
    rect.left < box.left + box.width &&
    rect.right > box.left &&
    rect.top < box.top + box.height &&
    rect.bottom > box.top
  );
}

/**
 * Selecting cards by dragging a box over them. The press has to start on the empty space
 * between the cards; the cards under the box are the ones marked with data-entry-id.
 */
export function useDragBox(onSelect: (ids: string[]) => void, onEmptyClick: () => void) {
  const [box, setBox] = useState<Box | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return;

    const pressed = event.target as HTMLElement;
    if (pressed.closest("[data-entry-id], button, a, input, [role='menu']")) return;

    const container = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;

    const onMove = (move: PointerEvent) => {
      const next: Box = {
        left: Math.min(start.x, move.clientX),
        top: Math.min(start.y, move.clientY),
        width: Math.abs(move.clientX - start.x),
        height: Math.abs(move.clientY - start.y),
      };
      if (!dragging && next.width < THRESHOLD && next.height < THRESHOLD) return;

      dragging = true;
      setBox(next);
      onSelect(
        Array.from(container.querySelectorAll<HTMLElement>("[data-entry-id]"))
          .filter((card) => intersects(card.getBoundingClientRect(), next))
          .map((card) => card.dataset.entryId ?? ""),
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setBox(null);
      if (!dragging) onEmptyClick();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Keeps the drag from selecting the text of the cards.
    event.preventDefault();
  };

  return { box, onPointerDown };
}
