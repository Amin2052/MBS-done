/**
 * Money for MBS (ADR-0003).
 *
 * Rules:
 *  - Values cross every boundary as decimal STRINGS, never JSON numbers.
 *  - Arithmetic uses decimal.js. `number` is never used for money, anywhere.
 *  - Storage is numeric(19,4); the API keeps 4 decimals, presentation rounds half-up.
 *  - The server computes totals. Clients only display.
 */
import Decimal from "decimal.js";

/** Four decimals is the storage scale; monetary comparisons happen at this scale. */
export const STORAGE_SCALE = 4;
/** Two decimals is what a BDT invoice shows. */
export const DISPLAY_SCALE = 2;

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

const MONEY_PATTERN = /^-?\d{1,15}(\.\d{1,6})?$/;

export class MoneyError extends Error {}

/** Parse a decimal string. Rejects numbers, exponents, NaN, Infinity and formatted text. */
export function parseMoney(value: string): Decimal {
  if (typeof value !== "string") {
    throw new MoneyError(`money must be a decimal string, received ${typeof value}`);
  }
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) {
    throw new MoneyError(`not a decimal string: ${JSON.stringify(value)}`);
  }
  return new Decimal(trimmed);
}

/** Canonical storage/transport form: fixed 4 decimals, never exponential. */
export function toStorageString(value: string | Decimal): string {
  const decimal = typeof value === "string" ? parseMoney(value) : value;
  return decimal.toFixed(STORAGE_SCALE, Decimal.ROUND_HALF_UP);
}

/** Presentation form: fixed 2 decimals, half-up. */
export function toDisplayString(value: string | Decimal): string {
  const decimal = typeof value === "string" ? parseMoney(value) : value;
  return decimal.toFixed(DISPLAY_SCALE, Decimal.ROUND_HALF_UP);
}

export function addMoney(a: string, b: string): string {
  return toStorageString(parseMoney(a).plus(parseMoney(b)));
}

export function subtractMoney(a: string, b: string): string {
  return toStorageString(parseMoney(a).minus(parseMoney(b)));
}

/** Multiply by an integer/quantity string (not by a percentage). */
export function multiplyMoney(amount: string, quantity: string): string {
  return toStorageString(parseMoney(amount).times(parseMoney(quantity)));
}

/** `percent` is a percentage such as "15" or "7.5", not a fraction. */
export function percentOf(amount: string, percent: string): string {
  const rate = parseMoney(percent).div(100);
  return toStorageString(parseMoney(amount).times(rate));
}

/** Sum a list exactly. An empty list is zero, not an error. */
export function sumMoney(values: readonly string[]): string {
  return toStorageString(values.reduce((total, value) => total.plus(parseMoney(value)), new Decimal(0)));
}

export function isZeroMoney(value: string): boolean {
  return parseMoney(value).isZero();
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  return parseMoney(a).cmp(parseMoney(b)) as -1 | 0 | 1;
}

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/**
 * Indian/Bangladeshi digit grouping: the last three digits, then groups of two.
 * 12345678.90 -> 1,23,45,678.90
 */
export function groupDigits(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split(".");
  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const head = whole.slice(0, whole.length - 3);
    const tail = whole.slice(-3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
  }
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

export interface FormatOptions {
  /** Digits shown to the owner: Bangla numerals by default (ADR-0008). */
  digits?: "bengali" | "latin";
  /** Include the taka sign. */
  symbol?: boolean;
  /** Decimal places, default 2. */
  scale?: number;
}

/** Render money for display. Storage strings are the input; digits chosen per business. */
export function formatMoney(value: string, options: FormatOptions = {}): string {
  const { digits = "latin", symbol = true, scale = DISPLAY_SCALE } = options;
  const decimal = typeof value === "string" ? parseMoney(value) : value;
  const fixed = decimal.toFixed(scale, Decimal.ROUND_HALF_UP);
  const grouped = groupDigits(fixed);
  const localised =
    digits === "bengali"
      ? grouped.replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)] as string)
      : grouped;
  return symbol ? `৳${localised}` : localised;
}
