import { supabase } from "@/lib/supabase";
import type { Column, Row } from "@/lib/excel";
import { neutralize } from "@/lib/neutral";
import type { InvoicePaymentStatus, InventoryItem, PayoutInvoice, PermissionDef, RoleRow, ShippingInvoice, ShippingInvoiceLine, TeamMember } from "@/lib/types";
import type { InventoryOrder, RestockedItem } from "@/hooks/useData";
import type { ReportDef } from "./types";
import { chunk, fetchAll, fig, filterLines, groupBy, inRange, statusLabel, sum } from "./util";

const PAYMENT_STATUS: Record<InvoicePaymentStatus, string> = { not_paid: "Not paid", partially_paid: "Partially paid", paid: "Paid" };
const payLabel = (s: InvoicePaymentStatus | null | undefined) => (s ? PAYMENT_STATUS[s] ?? s : "");

// ---------------------------------------------------------------- B9 Local stock & movements

const stock: ReportDef = {
  code: "B9", perm: "reports.stock", requires: ["inventory.view"], category: "Stock",
  title: "Local stock & movements",
  description: "What your local stock holds per SKU, the orders it filled and the returned items restocked into it.",
  filters: [],
  async run(_f, ctx) {
    ctx.progress("Loading local stock…");
    const inv = await fetchAll<InventoryItem>((from, to) =>
      supabase.from("brand_inventory").select("*").eq("brand_id", ctx.brandId).order("sku").order("id").range(from, to));
    const usage = await fetchAll<InventoryOrder>((from, to) =>
      supabase.from("brand_inventory_usage").select("*").eq("brand_id", ctx.brandId)
        .order("order_date", { ascending: true }).order("order_item_id").range(from, to),
      (n) => ctx.progress(`Loading stock usage… ${n.toLocaleString()}`));
    const restocked = await fetchAll<RestockedItem>((from, to) =>
      supabase.from("bd_restocked_items").select("*").eq("brand_id", ctx.brandId)
        .order("restocked_at", { ascending: true }).order("order_item_id").range(from, to),
      (n) => ctx.progress(`Loading restocked items… ${n.toLocaleString()}`));

    const name = new Map<string, string>();
    for (const r of [...usage, ...restocked]) if (r.sku && !name.has(r.sku)) name.set(r.sku, r.product_name);
    const usedBy = groupBy(usage.filter((u) => u.sku), (u) => u.sku!);
    const restockedBy = groupBy(restocked.filter((r) => r.sku), (r) => r.sku!);
    const skus = [...new Set([...inv.map((i) => i.sku), ...usedBy.keys(), ...restockedBy.keys()])]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const invBy = new Map(inv.map((i) => [i.sku, i]));
    const levels = skus.map((sku) => ({
      sku, product_name: name.get(sku) ?? "",
      available: invBy.get(sku)?.quantity_available ?? 0,
      updated_at: invBy.get(sku)?.updated_at ?? null,
      used: sum((usedBy.get(sku) ?? []).map((u) => u.inventory_qty)),
      used_orders: new Set((usedBy.get(sku) ?? []).map((u) => u.order_id)).size,
      restocked: sum((restockedBy.get(sku) ?? []).map((r) => r.quantity)),
    }));
    return {
      title: "Local stock and movements",
      filters: [`Brand: ${ctx.brandName}`, "All stock and all movements to date"],
      figures: [
        fig("SKUs in local stock", inv.filter((i) => Number(i.quantity_available) > 0).length),
        fig("Units available", sum(inv.map((i) => i.quantity_available))),
        fig("Units used for orders", sum(usage.map((u) => u.inventory_qty))),
        fig("Orders filled from local stock", new Set(usage.map((u) => u.order_id)).size),
        fig("Units restocked from returns", sum(restocked.map((r) => r.quantity))),
      ],
      sheets: [
        {
          name: "Stock levels",
          columns: [
            { header: "SKU", key: "sku", width: 18 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "Available now", key: "available", type: "number" },
            { header: "Last updated", key: "updated_at", type: "datetime" },
            { header: "Units used for orders", key: "used", type: "number" },
            { header: "Orders filled", key: "used_orders", type: "number" },
            { header: "Units restocked from returns", key: "restocked", type: "number" },
          ],
          rows: levels,
        },
        {
          name: "Used for orders",
          columns: [
            { header: "Order date", key: "order_date", type: "date" },
            { header: "Order", key: "order_number", width: 14 },
            { header: "Status", key: "status_label", width: 20 },
            { header: "Customer", key: "customer_name" },
            { header: "City", key: "city", width: 16 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "SKU", key: "sku", width: 16 },
            { header: "Variant", key: "variant", width: 14 },
            { header: "From local stock", key: "inventory_qty", type: "number" },
            { header: "Ordered", key: "quantity", type: "number" },
          ],
          rows: usage.map((u) => ({ ...u, status_label: statusLabel(u.status) })),
        },
        {
          name: "Restocked from returns",
          columns: [
            { header: "Restocked", key: "restocked_at", type: "datetime" },
            { header: "Order", key: "order_number", width: 14 },
            { header: "Order date", key: "order_date", type: "date" },
            { header: "Returned", key: "returned_at", type: "datetime" },
            { header: "Customer", key: "customer_name" },
            { header: "City", key: "city", width: 16 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "SKU", key: "sku", width: 16 },
            { header: "Variant", key: "variant", width: 14 },
            { header: "Qty", key: "quantity", type: "number", width: 7 },
            { header: "Still available", key: "available", type: "number" },
            { header: "Note", key: "restock_note", width: 30 },
          ],
          rows: restocked.map((r) => ({ ...r, available: r.available_qty ?? r.quantity, restock_note: neutralize(r.restock_note) })),
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B10 Payments & statements

const payables: ReportDef = {
  code: "B10", perm: "reports.brand_payables", requires: ["money.view"], category: "Payments",
  title: "Payments & statements",
  description: "Payment statements raised for you: delivered value, commission, return deductions, amount payable and payment status.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const invoices = await fetchAll<PayoutInvoice>((from, to) => {
      let q = supabase.from("invoices")
        .select("id, invoice_number, brand_id, order_count, total_value, advance_amount, net_remaining, payable_amount, payment_status, created_at, updated_at, lines")
        .eq("invoice_type", "brand_payout").eq("brand_id", ctx.brandId);
      q = inRange(q, "created_at", f);
      return q.order("created_at", { ascending: true }).order("id").range(from, to);
    }, (n) => ctx.progress(`Loading statements… ${n.toLocaleString()}`));
    const rows = invoices.map((i) => ({
      ...i, status: payLabel(i.payment_status),
      commission_pct: i.lines?.v360_commission_pct != null ? Number(i.lines.v360_commission_pct) / 100 : null,
      delivered_value: i.lines?.delivered_value ?? null, returned_value: i.lines?.returned_value ?? null,
      commission: i.net_remaining, deduction: i.advance_amount,
    }));
    const lines: Row[] = invoices.flatMap((i) => (i.lines?.orders ?? []).map((o) => ({
      invoice_number: i.invoice_number, invoice_date: i.created_at, order_number: o.order_number,
      order_date: o.order_date ?? null, customer_name: o.customer_name ?? null, city: o.city ?? null,
      outcome: statusLabel(o.status), mismatch: o.returned_due_to_discrepancy ? "Yes" : "No",
      value: o.value, commission: o.commission, deduction: o.returned_deduction, payable: o.payable,
    })));
    const byStatus = [...groupBy(rows, (r) => r.status)].map(([status, rs]) => ({ status, statements: rs.length, payable: sum(rs.map((r) => r.payable_amount)) }));
    return {
      title: "Payments and statements",
      filters: filterLines(f, ctx.brandName, "statement date"),
      notes: ["Amounts are in the statement currency (PKR)."],
      figures: [
        fig("Statements", rows.length),
        fig("Orders settled", sum(rows.map((r) => r.order_count))),
        fig("Delivered value", sum(rows.map((r) => r.delivered_value)), "money", true),
        fig("Commission", sum(rows.map((r) => r.commission)), "money", true),
        fig("Return deductions", sum(rows.map((r) => r.deduction)), "money", true),
        fig("Payable to you", sum(rows.map((r) => r.payable_amount)), "money", true),
        fig("Not yet paid", sum(rows.filter((r) => r.payment_status !== "paid").map((r) => r.payable_amount)), "money", true),
      ],
      breakdowns: [{
        name: "By payment status",
        columns: [{ header: "Status", key: "status" }, { header: "Statements", key: "statements", type: "number" }, { header: "Payable", key: "payable", type: "money", money: true }],
        rows: byStatus,
      }],
      sheets: [
        {
          name: "Statements",
          columns: [
            { header: "Statement", key: "invoice_number", width: 16 },
            { header: "Date", key: "created_at", type: "date" },
            { header: "Orders", key: "order_count", type: "number" },
            { header: "Delivered value", key: "delivered_value", type: "money", money: true },
            { header: "Commission %", key: "commission_pct", type: "percent", money: true },
            { header: "Commission", key: "commission", type: "money", money: true },
            { header: "Returned value", key: "returned_value", type: "money", money: true },
            { header: "Return deduction", key: "deduction", type: "money", money: true },
            { header: "Total order value", key: "total_value", type: "money", money: true },
            { header: "Payable to you", key: "payable_amount", type: "money", money: true },
            { header: "Payment status", key: "status", width: 14 },
            { header: "Last updated", key: "updated_at", type: "datetime" },
          ],
          rows,
        },
        {
          name: "Statement orders",
          columns: [
            { header: "Statement", key: "invoice_number", width: 16 },
            { header: "Statement date", key: "invoice_date", type: "date" },
            { header: "Order", key: "order_number", width: 14 },
            { header: "Order date", key: "order_date", type: "date" },
            { header: "Customer", key: "customer_name" },
            { header: "City", key: "city", width: 16 },
            { header: "Outcome", key: "outcome", width: 18 },
            { header: "Returned after a receiving mismatch", key: "mismatch", width: 14 },
            { header: "Order value", key: "value", type: "money", money: true },
            { header: "Commission", key: "commission", type: "money", money: true },
            { header: "Return deduction", key: "deduction", type: "money", money: true },
            { header: "Payable", key: "payable", type: "money", money: true },
          ],
          rows: lines,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B11 Shipping charges

const shippingCharges: ReportDef = {
  code: "B11", perm: "reports.shipping_charges", requires: ["invoices.view"], category: "Payments",
  title: "Shipping charges",
  description: "Shipping-charge invoices per shipment and their order lines: units, weight, rate, amount and payment status.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const invoices = await fetchAll<ShippingInvoice>((from, to) => {
      let q = supabase.from("brand_shipping_invoices")
        .select("*, shipment:shipments(code, shipping_partner, tracking_number, dispatched_at)").eq("brand_id", ctx.brandId);
      q = inRange(q, "created_at", f);
      return q.order("created_at", { ascending: true }).order("id").range(from, to);
    }, (n) => ctx.progress(`Loading invoices… ${n.toLocaleString()}`));
    const lines: ShippingInvoiceLine[] = [];
    for (const ids of chunk(invoices.map((i) => i.id))) {
      lines.push(...await fetchAll<ShippingInvoiceLine>((from, to) =>
        supabase.from("brand_shipping_invoice_lines").select("*").in("invoice_id", ids).order("order_number").order("id").range(from, to)));
      ctx.progress(`Loading invoice lines… ${lines.length.toLocaleString()}`);
    }
    const invOf = new Map(invoices.map((i) => [i.id, i]));
    const rows = invoices.map((i) => ({
      ...i, shipment_code: i.shipment?.code ?? "", shipping_partner: neutralize(i.shipment?.shipping_partner),
      tracking: i.shipment?.tracking_number ?? "", dispatched_at: i.shipment?.dispatched_at ?? null,
      rate_pkr: Number(i.freight_bdt_per_kg) * Number(i.fx_rate), status: payLabel(i.payment_status),
    }));
    const lineRows = lines.map((l) => {
      const i = invOf.get(l.invoice_id);
      return {
        ...l, invoice_number: i?.invoice_number ?? "", shipment_code: i?.shipment?.code ?? "",
        items_summary: neutralize(l.items_summary), status: payLabel(i?.payment_status),
      };
    }).sort((a, b) => a.invoice_number.localeCompare(b.invoice_number) || a.order_number.localeCompare(b.order_number, undefined, { numeric: true }));
    return {
      title: "Shipping charges",
      filters: filterLines(f, ctx.brandName, "invoice date"),
      notes: ["Units filled from your local stock are not charged."],
      figures: [
        fig("Invoices", rows.length),
        fig("Orders", sum(rows.map((r) => r.order_count))),
        fig("Units charged", sum(rows.map((r) => r.pk_units))),
        fig("Weight (kg)", sum(rows.map((r) => r.weight_kg)), "days"),
        fig("Charges (PKR)", sum(rows.map((r) => r.amount_pkr)), "money", true),
        fig("Not yet paid (PKR)", sum(rows.filter((r) => r.payment_status !== "paid").map((r) => r.amount_pkr)), "money", true),
      ],
      sheets: [
        {
          name: "Invoices",
          columns: [
            { header: "Invoice", key: "invoice_number", width: 16 },
            { header: "Date", key: "created_at", type: "date" },
            { header: "Shipment", key: "shipment_code", width: 12 },
            { header: "Shipping partner", key: "shipping_partner", width: 16 },
            { header: "Tracking", key: "tracking", width: 18 },
            { header: "Shipment left", key: "dispatched_at", type: "date" },
            { header: "Orders", key: "order_count", type: "number" },
            { header: "Units charged", key: "pk_units", type: "number" },
            { header: "Units from local stock", key: "bd_units", type: "number" },
            { header: "Weight (kg)", key: "weight_kg", type: "days" },
            { header: "Rate per kg (BDT)", key: "freight_bdt_per_kg", type: "money", money: true },
            { header: "FX rate", key: "fx_rate", type: "money", money: true },
            { header: "FX date", key: "fx_rate_date", type: "date", money: true },
            { header: "Rate per kg (PKR)", key: "rate_pkr", type: "money", money: true },
            { header: "Charge (PKR)", key: "amount_pkr", type: "money", money: true },
            { header: "Payment status", key: "status", width: 14 },
            { header: "Paid on", key: "paid_at", type: "date" },
          ],
          rows,
        },
        {
          name: "Invoice lines",
          columns: [
            { header: "Invoice", key: "invoice_number", width: 16 },
            { header: "Shipment", key: "shipment_code", width: 12 },
            { header: "Order", key: "order_number", width: 14 },
            { header: "Customer", key: "customer_name" },
            { header: "Items", key: "items_summary", width: 36 },
            { header: "Units charged", key: "pk_units", type: "number" },
            { header: "Units from local stock", key: "bd_units", type: "number" },
            { header: "Weight (kg)", key: "weight_kg", type: "days" },
            { header: "Charge (PKR)", key: "amount_pkr", type: "money", money: true },
            { header: "Payment status", key: "status", width: 14 },
          ],
          rows: lineRows,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B13 Staff & roles

const usersAccess: ReportDef = {
  code: "B13", perm: "reports.users_access", category: "Team",
  title: "Staff & roles",
  description: "Everyone with access to your brand and their role, plus what each role is allowed to do.",
  filters: [],
  async run(_f, ctx) {
    ctx.progress("Loading team…");
    const [team, members, roles, catalog] = await Promise.all([
      supabase.from("team_members").select("*").eq("organization_id", ctx.brandId).order("created_at"),
      supabase.from("memberships").select("id, role_id").eq("organization_id", ctx.brandId),
      supabase.from("roles").select("*, role_permissions(permission)").eq("organization_id", ctx.brandId).order("name"),
      supabase.from("permissions").select("*").order("sort"),
    ]);
    for (const r of [team, members, roles, catalog]) if (r.error) throw r.error;
    const roleOf = new Map(((members.data ?? []) as { id: string; role_id: string | null }[]).map((m) => [m.id, m.role_id]));
    const roleList = (roles.data ?? []) as Omit<RoleRow, "member_count">[];
    const roleName = new Map(roleList.map((r) => [r.id, r.name]));
    const people = ((team.data ?? []) as Omit<TeamMember, "role_id">[]).map((m) => {
      const rid = roleOf.get(m.membership_id) ?? null;
      const access = m.role === "brand_owner" ? "Owner" : rid ? roleName.get(rid) ?? "Unknown role" : "No role";
      return { full_name: m.full_name, email: m.email, phone: m.phone, access, created_at: m.created_at };
    });
    const perms = ((catalog.data ?? []) as PermissionDef[]).filter((p) => (p.applies_to ?? []).includes("brand"));
    const roleCols: Column[] = roleList.map((r) => ({ header: r.name, key: `r_${r.id}`, width: 14 }));
    const matrix = perms.map((p) => {
      const row: Row = { area: neutralize(p.area), label: neutralize(p.label), description: neutralize(p.description), owner: "Yes" };
      for (const r of roleList) row[`r_${r.id}`] = r.role_permissions.some((x) => x.permission === p.key) ? "Yes" : "";
      return row;
    });
    const brandKeys = new Set(perms.map((p) => p.key));
    const roleRows = roleList.map((r) => ({
      name: r.name, description: r.description, people: people.filter((p) => p.access === r.name).length,
      permissions: r.role_permissions.filter((x) => brandKeys.has(x.permission)).length,
    }));
    const byAccess = [...groupBy(people, (p) => p.access)].map(([access, ps]) => ({ access, people: ps.length }))
      .sort((a, b) => b.people - a.people);
    return {
      title: "Staff and roles",
      filters: [`Brand: ${ctx.brandName}`],
      figures: [
        fig("People with access", people.length),
        fig("Owners", people.filter((p) => p.access === "Owner").length),
        fig("Roles", roleList.length),
        fig("People without a role", people.filter((p) => p.access === "No role").length),
      ],
      breakdowns: [{ name: "People by role", columns: [{ header: "Role", key: "access" }, { header: "People", key: "people", type: "number" }], rows: byAccess }],
      sheets: [
        {
          name: "People",
          columns: [
            { header: "Name", key: "full_name", width: 24 },
            { header: "Email", key: "email", width: 30 },
            { header: "Phone", key: "phone", width: 16 },
            { header: "Role", key: "access", width: 20 },
            { header: "Added", key: "created_at", type: "date" },
          ],
          rows: people,
        },
        {
          name: "Roles",
          columns: [
            { header: "Role", key: "name", width: 22 },
            { header: "Description", key: "description", width: 40 },
            { header: "People", key: "people", type: "number" },
            { header: "Permissions", key: "permissions", type: "number" },
          ],
          rows: [{ name: "Owner", description: "Every permission, and manages staff and roles", people: people.filter((p) => p.access === "Owner").length, permissions: perms.length }, ...roleRows],
        },
        {
          name: "Permissions by role",
          columns: [
            { header: "Area", key: "area", width: 16 },
            { header: "Permission", key: "label", width: 30 },
            { header: "What it allows", key: "description", width: 44 },
            { header: "Owner", key: "owner", width: 9 },
            ...roleCols,
          ],
          rows: matrix,
        },
      ],
    };
  },
};

export const STOCK_REPORTS: ReportDef[] = [stock];
export const PAYMENT_REPORTS: ReportDef[] = [payables, shippingCharges];
export const TEAM_REPORTS: ReportDef[] = [usersAccess];
