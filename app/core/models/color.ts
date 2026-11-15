/**
 * Colors travel as Android ARGB integers: 0xAARRGGBB read as a signed 32-bit number, so most
 * of them are negative in JSON (opaque red is -65536).
 */

/** The CSS color of an ARGB integer. */
export function argbToCss(argb: number): string {
  const value = argb >>> 0;
  const alpha = (value >>> 24) & 0xff;
  const red = (value >>> 16) & 0xff;
  const green = (value >>> 8) & 0xff;
  const blue = value & 0xff;

  if (alpha === 0xff) return `#${hex(red)}${hex(green)}${hex(blue)}`;
  return `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
}

/** The ARGB integer of a hex color: #rgb, #rrggbb or #rrggbbaa. Null when it is not one. */
export function hexToArgb(color: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!match) return null;

  let digits = match[1]!;
  if (digits.length === 3) digits = [...digits].map((digit) => digit + digit).join("");

  const rgb = parseInt(digits.slice(0, 6), 16);
  const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) : 0xff;

  // `| 0` folds the unsigned value into the signed 32-bit integer the other apps store.
  return (alpha << 24) | rgb | 0;
}

function hex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}
