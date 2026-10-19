// Money is always integer kobo. 100 kobo = ₦1.

/** Parse user input such as "145,000", "₦145,000.50" or "145000.5" into kobo. Returns null for blank, NaN for invalid. */
export function parseNairaToKobo(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return Number.NaN;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[₦,\s]/g, "").replace(/^NGN/i, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const wholeFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const koboFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₦1,240,500" or "₦1,240,500.50". Null renders as an em dash placeholder. */
export function formatKobo(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "—";
  const naira = kobo / 100;
  return kobo % 100 === 0 ? wholeFormatter.format(naira) : koboFormatter.format(naira);
}

/** Value for an input field: "145000" or "145000.50". */
export function koboToInput(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "";
  const whole = Math.floor(kobo / 100);
  const frac = kobo % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

/** Sum that stays null only when every part is null. */
export function sumKobo(...parts: Array<number | null | undefined>): number | null {
  const known = parts.filter((p): p is number => typeof p === "number");
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}
