/**
 * The caret inside a block as character offsets into its text, and back. Offsets count
 * UTF-16 code units of the text nodes, the same as the text of the block.
 */

export type Offsets = { start: number; end: number };

function offsetOf(element: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The selection inside [element], ordered; null when it is elsewhere. */
export function getCaret(element: HTMLElement): Offsets | null {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return null;
  if (!element.contains(anchorNode) || !element.contains(focusNode)) return null;

  const anchor = offsetOf(element, anchorNode, selection.anchorOffset);
  const focus = offsetOf(element, focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

/** The text node and the offset in it where character [offset] of [element] is. */
function pointAt(element: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (remaining <= text.length) return { node: text, offset: remaining };
    remaining -= text.length;
    last = text;
  }
  return last ? { node: last, offset: last.length } : { node: element, offset: 0 };
}

export function setCaret(element: HTMLElement, start: number, end: number = start) {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const length = (element.textContent ?? "").length;
  const from = pointAt(element, Math.max(0, Math.min(start, length)));
  const to = pointAt(element, Math.max(0, Math.min(end, length)));

  const range = element.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Where the caret is drawn, when the browser can tell. */
export function caretRect(element: HTMLElement): DOMRect | null {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  const rects = range.getClientRects?.();
  const rect = rects && rects.length > 0 ? rects[0]! : range.getBoundingClientRect?.();
  if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
    // An empty line has no rectangle of its own.
    const box = element.getBoundingClientRect();
    return box.height > 0 ? new DOMRect(box.left, box.top, 0, lineHeight(element)) : null;
  }
  return rect;
}

function lineHeight(element: HTMLElement): number {
  const value = parseFloat(getComputedStyle(element).lineHeight);
  return Number.isFinite(value) ? value : 20;
}

/** Whether the caret is on the first line of [element]; true when the browser cannot tell. */
export function isOnFirstLine(element: HTMLElement): boolean {
  const rect = caretRect(element);
  if (!rect) return true;
  return rect.top - element.getBoundingClientRect().top < lineHeight(element) * 0.8;
}

export function isOnLastLine(element: HTMLElement): boolean {
  const rect = caretRect(element);
  if (!rect) return true;
  return element.getBoundingClientRect().bottom - rect.bottom < lineHeight(element) * 0.8;
}

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** The offset in [element] nearest to the point, when the browser can tell. */
export function offsetAtPoint(element: HTMLElement, x: number, y: number): number | null {
  const doc = element.ownerDocument as CaretPositionDocument;
  let node: Node | null = null;
  let offset = 0;

  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || !element.contains(node)) return null;
  return offsetOf(element, node, offset);
}
