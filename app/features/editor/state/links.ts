/** Web addresses in text: LinkDetector of the Compose and the Swift apps. */

const LINK = /^https?:\/\/[^\s]+$/i;

/** Whether [text], trimmed, is one web address and nothing else. */
export function isLink(text: string): boolean {
  const trimmed = text.trim();
  if (!LINK.test(trimmed)) return false;

  // The address needs a host after the scheme.
  const host = trimmed.slice(trimmed.indexOf("://") + 3).split(/[/?#]/)[0] ?? "";
  return host.length > 0;
}

/**
 * Whether an empty line received a whole address at once, which is what a paste does: typing
 * an address key by key never goes from empty to a full link in one edit.
 */
export function isPastedLink(previous: string, next: string): boolean {
  return previous.trim() === "" && isLink(next);
}
