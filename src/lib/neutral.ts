/**
 * The database records which internal team acted and sometimes names it in
 * messages. Brands should only ever see "our team" / "delivery partner",
 * so everything shown from the database passes through here.
 */
const INTERNAL_NAMES = /\b(V360|KBB)\b/gi;
// Last-mile couriers (e.g. "Booked with RedX", "RedX: out for delivery").
const COURIER_NAMES = /\b(RedX|Pathao|Steadfast|Paperfly|eCourier|Sundarban)\b/gi;

export function neutralize(text: string | null | undefined): string {
  if (!text) return "";
  const out = text
    .replace(/\bV360 hub\b/gi, "hub")
    .replace(/\bKBB Fulfilment\b/gi, "delivery partner")
    .replace(/\bKBB fulfillment\b/gi, "delivery partner")
    .replace(/\bKBB partner\b/gi, "delivery partner")
    .replace(/\bthe fulfilment partner\b/gi, "the delivery partner")
    .replace(/\bthe fulfillment partner\b/gi, "the delivery partner")
    .replace(/\bfulfilment partner\b/gi, "delivery partner")
    .replace(/\bfulfillment partner\b/gi, "delivery partner")
    .replace(INTERNAL_NAMES, "our team")
    .replace(/\bour team or our team\b/gi, "our team")
    .replace(COURIER_NAMES, "the delivery partner");
  // Capitalise if a replacement landed at the start of a sentence.
  return out.replace(/(^|[.!?]\s+)(our team|the delivery partner)/g,
    (_m, pre: string, word: string) => `${pre}${word[0].toUpperCase()}${word.slice(1)}`);
}

/** Who did something, as a brand should see it. */
export function displayActor(label: string | null | undefined, brandName: string): string {
  if (!label || label === "System") return "System";
  if (label === "Shopify") return "Shopify";
  if (label === brandName) return "You";
  return "Our team";
}
