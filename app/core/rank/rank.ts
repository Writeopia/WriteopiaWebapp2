/**
 * The position of a step as a sort key that always has room between two neighbours, so no step
 * ever has to move to make room for another (fractional indexing). A port of Rank.kt of the
 * Writeopia SDK; the keys it makes must sort the same in every client and in PostgreSQL.
 *
 * A rank is an integer part of 10 decimal digits, zero padded, followed by an optional fraction
 * in base 36 (0-9a-z) with no trailing 0. Ranks compare as plain strings.
 *
 * - A step written after the last one gets the next integer: 0001000000, 0001000001...
 * - A step added between two others gets the midpoint of their fractions: between 0001000000
 *   and 0001000001 comes 0001000000i.
 * - A short random suffix goes on every key made between two others, so two devices inserting
 *   between the same steps do not produce the same key.
 */

const INTEGER_WIDTH = 10;
const FIRST_INTEGER = 1_000_000;
const MAX_INTEGER = 9_999_999_999;
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const JITTER_LENGTH = 2;

/** The position of the first step of a new document: the title, which is also the header. */
export const RANK_FIRST = "0001000000";

/** Below every rank; never a rank itself. */
export const RANK_NONE = "";

/**
 * Whether keys made between two others get a random suffix. On by default; tests that assert
 * exact keys turn it off.
 */
export const rankConfig = { jitter: true };

/** The rank of the [index]th step of a document written in order: RANK_FIRST for 0. */
export function rankAt(index: number): string {
  return integer(FIRST_INTEGER + index);
}

/** The rank right after [rank]: the next integer. */
export function rankAfter(rank: string): string {
  const next = integerPart(rank) + 1;
  return next <= MAX_INTEGER
    ? integer(next)
    : integer(integerPart(rank)) + midpoint(fractionPart(rank), null);
}

/** The rank right before [rank]: its integer alone when it has a fraction, else the previous integer. */
export function rankBefore(rank: string): string {
  const value = integerPart(rank);

  if (fractionPart(rank).length > 0) return integer(value);
  if (value > 0) return integer(value - 1);
  throw new Error(`No rank before ${rank}`);
}

/**
 * A rank strictly between [after] and [before] (null for no bound on that side). When the
 * integers leave room, the integer right after [after]; otherwise the midpoint of the
 * fractions, with a random suffix when the jitter is on.
 */
export function rankBetween(after: string | null, before: string | null): string {
  if (after === null && before === null) return RANK_FIRST;
  if (after === null) return rankBefore(before!);
  if (before === null) return rankAfter(after);
  if (!(after < before)) throw new Error(`Ranks out of order: ${after} >= ${before}`);

  const integerAfter = integerPart(after);
  const integerBefore = integerPart(before);

  let key: string;
  if (integerBefore > integerAfter + 1) {
    key = integer(integerAfter + 1);
  } else if (integerBefore === integerAfter + 1) {
    key = integer(integerAfter) + midpoint(fractionPart(after), null);
  } else {
    key = integer(integerAfter) + midpoint(fractionPart(after), fractionPart(before));
  }

  return jittered(key, before);
}

/** [count] ranks in order, each between the one before it and [before]. */
export function ranksBetween(after: string | null, before: string | null, count: number): string[] {
  const keys: string[] = [];
  let previous = after;

  for (let i = 0; i < count; i++) {
    const key = rankBetween(previous, before);
    keys.push(key);
    previous = key;
  }

  return keys;
}

/** Whether [value] has the shape of a rank. */
export function isRank(value: string): boolean {
  return /^\d{10}[0-9a-z]*$/.test(value) && !(value.length > INTEGER_WIDTH && value.endsWith("0"));
}

function jittered(key: string, before: string): string {
  if (!rankConfig.jitter) return key;

  let suffix = "";
  for (let i = 0; i < JITTER_LENGTH - 1; i++) suffix += DIGITS[randomInt(DIGITS.length)];
  suffix += DIGITS[1 + randomInt(DIGITS.length - 1)]; // never a trailing 0

  const candidate = key + suffix;
  return candidate < before ? candidate : key;
}

function randomInt(until: number): number {
  return Math.floor(Math.random() * until);
}

function integerPart(rank: string): number {
  const value = Number(rank.slice(0, INTEGER_WIDTH));
  if (!Number.isInteger(value)) throw new Error(`Not a rank: ${rank}`);
  return value;
}

function fractionPart(rank: string): string {
  return rank.slice(INTEGER_WIDTH);
}

function integer(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INTEGER) {
    throw new Error(`Rank integer out of range: ${value}`);
  }
  return String(value).padStart(INTEGER_WIDTH, "0");
}

/**
 * A fraction strictly between [a] and [b] (null for the top), both without trailing 0. The
 * classic fractional-indexing midpoint over base-36 digits.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    if (!(a < b)) throw new Error(`Fractions out of order: ${a} >= ${b}`);

    let common = 0;
    while (common < b.length && (a[common] ?? "0") === b[common]) common++;
    if (common > 0) return b.slice(0, common) + midpoint(a.slice(common), b.slice(common));
  }

  const digitA = a.length > 0 ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;

  if (digitB - digitA > 1) return DIGITS[Math.floor((digitA + digitB) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}
