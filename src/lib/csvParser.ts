import type { OrderStatus } from "./types";

export interface ParsedCsvOrder {
  order_number: string;
  order_date?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country_code?: string;
  currency?: string;
  subtotal?: number;
  discount_total?: number;
  shipping_total?: number;
  order_total: number;
  cod_amount_expected?: number;
  cod_currency?: string;
  status?: OrderStatus;
  items: Array<{
    product_name: string;
    sku?: string;
    variant?: string;
    quantity: number;
    unit_price: number;
    discount?: number;
  }>;
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  // Normalize header: lowercase, replace spaces/slashes/dashes with underscores
  const normalizeKey = (h: string) =>
    h.toLowerCase().replace(/[\s/\-().]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

  const headers = parseLine(lines[0]).map(normalizeKey);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawValues = parseLine(lines[i]);
    if (rawValues.length === 0 || (rawValues.length === 1 && !rawValues[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (rawValues[idx] ?? "").trim(); });
    rows.push(row);
  }

  return rows;
}

/** Pick the first truthy value from a list of row keys. */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function num(v: string | undefined, fallback = 0): number {
  if (!v) return fallback;
  const parsed = parseFloat(v.replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? fallback : parsed;
}

export function parseOrdersFromCSV(rows: Record<string, string>[]): ParsedCsvOrder[] {
  const orderMap = new Map<string, ParsedCsvOrder>();

  rows.forEach((row) => {
    // ── Order number ──────────────────────────────────────────────────
    // Shopify exports: "Name" (#1001), also accept order_number, id, number
    const rawNumber = pick(row,
      "name",            // Shopify standard export
      "order_name",
      "order_number",
      "order_id",
      "id",
      "number",
    );

    // If empty this is a continuation line (additional line items for same order)
    // in Shopify's multi-line export. Re-use the last seen order key by checking the map.
    const isLineContinuation = !rawNumber;
    let orderKey: string;
    if (isLineContinuation && orderMap.size > 0) {
      // Last inserted key
      orderKey = [...orderMap.keys()][orderMap.size - 1];
    } else if (!rawNumber) {
      return; // truly blank row, skip
    } else {
      orderKey = rawNumber.startsWith("#") ? rawNumber : `#${rawNumber}`;
    }

    // ── Line item ─────────────────────────────────────────────────────
    // Shopify: "Lineitem name", "Lineitem quantity", "Lineitem price", "Lineitem sku"
    const itemName = pick(row,
      "lineitem_name",        // Shopify export (normalized from "Lineitem name")
      "line_item_name",
      "product_name",
      "item_name",
      "item",
      "title",
    );

    const itemQtyRaw = pick(row,
      "lineitem_quantity",    // Shopify
      "line_item_quantity",
      "quantity",
      "qty",
    );
    const itemQty = Math.max(1, parseInt(itemQtyRaw || "1", 10) || 1);

    const itemPriceRaw = pick(row,
      "lineitem_price",       // Shopify
      "line_item_price",
      "unit_price",
      "price",
      "item_price",
    );

    const itemSku = pick(row,
      "lineitem_sku",         // Shopify
      "line_item_sku",
      "sku",
      "variant_sku",
    );

    const itemVariant = pick(row,
      "lineitem_variant_title", // sometimes present
      "variant_title",
      "variant",
    );

    const itemDiscountRaw = pick(row,
      "lineitem_discount",
      "line_item_discount",
      "item_discount",
    );

    // ── Order-level fields (only set for first row of each order) ─────
    if (!orderMap.has(orderKey)) {
      // ── Customer name ───────────────────────────────────────────────
      // Shopify: "Billing Name" / "Shipping Name"
      const customerName = pick(row,
        "billing_name",        // Shopify
        "shipping_name",
        "customer_name",
        "customer",
        "name",                // Shopify also uses "Name" for order – only if rawNumber was different
      );

      // ── Order total ─────────────────────────────────────────────────
      const orderTotalRaw = pick(row,
        "total",
        "total_price",
        "order_total",
        "amount",
        "grand_total",
      );
      const subtotalRaw = pick(row, "subtotal", "subtotal_price");
      const discountRaw = pick(row,
        "discount_amount",
        "discount_total",
        "total_discounts",
      );
      const shippingRaw = pick(row,
        "shipping",
        "shipping_total",
        "total_shipping",
      );

      const orderTotal = num(orderTotalRaw) || num(itemPriceRaw) * itemQty;
      const subtotal   = num(subtotalRaw, orderTotal);
      const discount   = num(discountRaw);
      const shipping   = num(shippingRaw);

      // ── Financials / COD ────────────────────────────────────────────
      const currency    = (pick(row, "currency") || "BDT").toUpperCase();
      const codRaw      = pick(row, "cod_amount_expected", "cod_amount", "cod");
      const codCurrency = (pick(row, "cod_currency") || currency).toUpperCase();

      // ── Date ────────────────────────────────────────────────────────
      const orderDateRaw = pick(row,
        "created_at",          // Shopify
        "order_date",
        "date",
        "created",
      );

      // ── Address ─────────────────────────────────────────────────────
      const address1 = pick(row,
        "billing_address1",    // Shopify
        "shipping_address1",
        "address1",
        "address",
      );
      const address2 = pick(row,
        "billing_address2",
        "shipping_address2",
        "address2",
      );
      const city = pick(row,
        "billing_city",        // Shopify
        "shipping_city",
        "city",
      ) || "Dhaka";

      const province = pick(row,
        "billing_province",
        "shipping_province",
        "province",
        "state",
      );
      const zip = pick(row,
        "billing_zip",
        "shipping_zip",
        "zip",
        "postal_code",
      );
      const countryCode = (pick(row,
        "billing_country_code",
        "shipping_country_code",
        "country_code",
        "country",
      ) || "BD").toUpperCase().slice(0, 2);

      const phone = pick(row,
        "billing_phone",       // Shopify
        "shipping_phone",
        "customer_phone",
        "phone",
        "mobile",
      );
      const email = pick(row,
        "email",
        "customer_email",
        "billing_email",
      );

      // ── Status ──────────────────────────────────────────────────────
      const rawStatus = pick(row, "status", "financial_status").toLowerCase();
      const validStatuses: OrderStatus[] = [
        "new", "brand_confirmed", "confirmation_pending", "customer_unreachable", "needs_amendment",
        "confirmed", "brand_preparing",
      ];
      const status: OrderStatus = validStatuses.includes(rawStatus as OrderStatus)
        ? (rawStatus as OrderStatus)
        : "confirmed";

      const itemUnitPrice = num(itemPriceRaw, orderTotal / itemQty);

      orderMap.set(orderKey, {
        order_number: orderKey,
        order_date: orderDateRaw ? new Date(orderDateRaw).toISOString() : new Date().toISOString(),
        customer_name: customerName || "Manual Customer",
        customer_phone: phone || undefined,
        customer_email: email || undefined,
        address1: address1 || undefined,
        address2: address2 || undefined,
        city,
        province: province || undefined,
        zip: zip || undefined,
        country_code: countryCode,
        currency,
        subtotal,
        discount_total: discount,
        shipping_total: shipping,
        order_total: orderTotal,
        cod_amount_expected: num(codRaw, orderTotal),
        cod_currency: codCurrency,
        status,
        items: itemName
          ? [{
              product_name: itemName,
              sku: itemSku || undefined,
              variant: itemVariant || undefined,
              quantity: itemQty,
              unit_price: itemUnitPrice,
              discount: num(itemDiscountRaw),
            }]
          : [],
      });
    } else if (itemName) {
      // Additional line item rows (Shopify multi-line format)
      const existing = orderMap.get(orderKey)!;
      existing.items.push({
        product_name: itemName,
        sku: itemSku || undefined,
        variant: itemVariant || undefined,
        quantity: itemQty,
        unit_price: num(itemPriceRaw),
        discount: num(itemDiscountRaw),
      });
    }
  });

  return Array.from(orderMap.values());
}
