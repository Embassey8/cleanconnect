import { roundNaira } from "./money";

export type LaundryService = "dry" | "wash" | "iron";

/** price[item][service]; null/undefined = not offered. */
export type LaundryPriceList = Record<string, Partial<Record<LaundryService, number | null>>>;

/** Quantities keyed by `${service}:${itemId}`. */
export type LaundryQty = Record<string, number>;

export interface LaundrySettings {
  expressPct: number;
  deliveryFee: number;
  freeDeliveryOver: number;
}

export const DEFAULT_LAUNDRY_SETTINGS: LaundrySettings = {
  expressPct: 50,
  deliveryFee: 1500,
  freeDeliveryOver: 20000,
};

/** Placeholder until the commission decision (BUILD_BRIEF §14) is made. */
export const DEFAULT_COMMISSION_RATE = 0.15;

export const LAUNDRY_SERVICES: { id: LaundryService; label: string }[] = [
  { id: "dry", label: "Dry clean" },
  { id: "wash", label: "Wash & fold" },
  { id: "iron", label: "Iron only" },
];

export const DEFAULT_LAUNDRY_ITEMS: { id: string; name: string }[] = [
  { id: "shirt", name: "Shirt / blouse" },
  { id: "trousers", name: "Trousers / skirt" },
  { id: "native", name: "Native wear (2-piece)" },
  { id: "agbada", name: "Agbada (3-piece)" },
  { id: "suit", name: "Suit (2-piece)" },
  { id: "gown", name: "Gown / dress" },
  { id: "bedsheet", name: "Bedsheet set" },
  { id: "duvet", name: "Duvet" },
  { id: "towel", name: "Towel" },
];

export const qtyKey = (service: LaundryService, itemId: string) => `${service}:${itemId}`;

export const unitPrice = (
  prices: LaundryPriceList,
  itemId: string,
  service: LaundryService,
): number | null => {
  const p = prices[itemId]?.[service];
  return p == null ? null : p;
};

export interface LaundryTotals {
  itemCount: number;
  subtotal: number;
  express: number;
  /** subtotal + express */
  cleaning: number;
  delivery: number;
  total: number;
  commission: number;
  providerEarns: number;
  /** Naira still needed for free delivery; 0 when free/empty. */
  freeDeliveryGap: number;
}

export function computeLaundry(
  prices: LaundryPriceList,
  qty: LaundryQty,
  isExpress: boolean,
  settings: LaundrySettings = DEFAULT_LAUNDRY_SETTINGS,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): LaundryTotals {
  let subtotal = 0;
  let itemCount = 0;
  for (const [key, q] of Object.entries(qty)) {
    if (!(q > 0)) continue;
    const [service, itemId] = key.split(":") as [LaundryService, string];
    const unit = unitPrice(prices, itemId, service);
    if (unit == null) continue; // not offered
    subtotal += q * unit;
    itemCount += q;
  }
  const express = isExpress ? roundNaira((subtotal * settings.expressPct) / 100) : 0;
  const cleaning = subtotal + express;
  const delivery =
    itemCount === 0 || cleaning >= settings.freeDeliveryOver ? 0 : settings.deliveryFee;
  const commission = roundNaira(cleaning * commissionRate);
  return {
    itemCount,
    subtotal,
    express,
    cleaning,
    delivery,
    total: cleaning + delivery,
    commission,
    providerEarns: cleaning - commission + delivery,
    freeDeliveryGap:
      itemCount === 0 || delivery === 0 ? 0 : settings.freeDeliveryOver - cleaning,
  };
}

/** Intake: sequential tag numbers across lines, e.g. 0412–0416. */
export function assignTags(counts: number[], firstTag: number): string[] {
  const pad = (n: number) => String(n).padStart(4, "0");
  let tag = firstTag;
  return counts.map((c) => {
    const out = c <= 0 ? "—" : c === 1 ? pad(tag) : `${pad(tag)}–${pad(tag + c - 1)}`;
    tag += Math.max(0, c);
    return out;
  });
}

/** Counted vs booked: customer must approve when the total differs. */
export function intakeDiff(booked: LaundryTotals, counted: LaundryTotals) {
  const diff = counted.total - booked.total;
  return { diff, needsApproval: diff !== 0 };
}

export interface IntakeLine { unitPrice: number; counted: number }

/**
 * Recalculates an order after the shop counts the items. Mirrors `submit_intake` in the database:
 * the express percentage is the one the customer was quoted, and delivery is free over the threshold.
 */
export function recomputeIntake(
  lines: IntakeLine[],
  opts: { expressPct: number; deliveryFee: number; freeDeliveryOver: number },
) {
  const items = lines.reduce((a, l) => a + l.counted, 0);
  const sub = lines.reduce((a, l) => a + l.counted * l.unitPrice, 0);
  const express = roundNaira((sub * opts.expressPct) / 100);
  const cleaning = sub + express;
  const delivery = items === 0 || cleaning >= opts.freeDeliveryOver ? 0 : opts.deliveryFee;
  return { items, sub, express, cleaning, delivery, total: cleaning + delivery };
}

/** The pricing a customer was quoted, recovered from the stored order (percent of subtotal that was express). */
export const quotedExpressPct = (subtotal: number, surcharge: number): number =>
  subtotal > 0 && surcharge > 0 ? Math.round((surcharge * 100) / subtotal) : 0;

export const EXPRESS_TURNAROUND_HOURS = 8;

/** When an order is due back to the customer, from the moment the shop received it. */
export function laundryDueAt(receivedAt: Date, express: boolean, standardHours: number = 48): Date {
  return new Date(receivedAt.getTime() + (express ? EXPRESS_TURNAROUND_HOURS : standardHours) * 3_600_000);
}
