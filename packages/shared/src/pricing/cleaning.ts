import { roundNaira } from "./money";

export type PropertyType = "home" | "office" | "school" | "shop";
export type CleaningType = "regular" | "deep" | "move" | "post";
export type Frequency = "once" | "week" | "month";

export interface CleaningAreaDef {
  id: string;
  name: string;
  unit: string;
}

export const PROPERTY_TYPES: { id: PropertyType; label: string; sub: string }[] = [
  { id: "home", label: "Home", sub: "Houses & flats" },
  { id: "office", label: "Office", sub: "Corporate & co-working" },
  { id: "school", label: "School", sub: "Classrooms & halls" },
  { id: "shop", label: "Shop", sub: "Retail & stores" },
];

export const CLEANING_AREAS: Record<PropertyType, CleaningAreaDef[]> = {
  home: [
    { id: "bed", name: "Bedroom", unit: "per room" },
    { id: "sit", name: "Sitting room", unit: "per room" },
    { id: "kit", name: "Kitchen", unit: "each" },
    { id: "bath", name: "Bathroom / toilet", unit: "each" },
    { id: "din", name: "Dining area", unit: "each" },
    { id: "bal", name: "Balcony / terrace", unit: "each" },
    { id: "stair", name: "Staircase", unit: "per flight" },
  ],
  office: [
    { id: "room", name: "Private office", unit: "per room" },
    { id: "open", name: "Open-plan area", unit: "per 50 m²" },
    { id: "meet", name: "Meeting room", unit: "per room" },
    { id: "rec", name: "Reception / lobby", unit: "each" },
    { id: "rest", name: "Restroom", unit: "each" },
    { id: "kitn", name: "Kitchenette", unit: "each" },
  ],
  school: [
    { id: "class", name: "Classroom", unit: "per room" },
    { id: "staff", name: "Staff room / office", unit: "per room" },
    { id: "hall", name: "Assembly hall", unit: "each" },
    { id: "lib", name: "Library / lab", unit: "each" },
    { id: "restb", name: "Restroom block", unit: "each" },
    { id: "corr", name: "Corridor", unit: "per floor" },
  ],
  shop: [
    { id: "floor", name: "Shop floor", unit: "per 50 m²" },
    { id: "store", name: "Storeroom", unit: "each" },
    { id: "win", name: "Display window", unit: "per window" },
    { id: "fit", name: "Fitting room", unit: "each" },
    { id: "rest", name: "Restroom", unit: "each" },
  ],
};

export const DEFAULT_CLEANING_MULTIPLIERS: Record<CleaningType, number> = {
  regular: 1,
  deep: 1.6,
  move: 1.8,
  post: 2.2,
};

export const CLEANING_TYPE_LABELS: Record<CleaningType, string> = {
  regular: "Regular cleaning",
  deep: "Deep cleaning",
  move: "Move-in / move-out",
  post: "Post-construction",
};

/** Fixed for now; "extras provider-set?" is an open decision (BUILD_BRIEF §6.2/§14). */
export const CLEANING_EXTRAS: { id: string; name: string; price: number }[] = [
  { id: "fridge", name: "Inside fridge & oven", price: 3000 },
  { id: "win", name: "Inside windows", price: 4000 },
  { id: "carpet", name: "Carpet / rug shampoo", price: 5000 },
  { id: "disinfect", name: "Disinfection", price: 10000 },
  { id: "polish", name: "Floor scrub & polish", price: 15000 },
];

export const FREQUENCY_DISCOUNT: Record<Frequency, number> = {
  once: 0,
  week: 0.1,
  month: 0.05,
};

export const DEFAULT_MIN_ORDER = 10000;

export interface CleaningInput {
  propertyType: PropertyType;
  cleaningType: CleaningType;
  frequency: Frequency;
  /** Provider price per area id for the current property type. Missing/null = not offered. */
  areaPrices: Record<string, number | null | undefined>;
  /** Quantity per area id (current property type only). */
  qty: Record<string, number>;
  extras: string[];
  multipliers?: Record<CleaningType, number>;
  minOrder?: number;
}

export interface CleaningTotals {
  areaCount: number;
  areaSub: number;
  typeExtra: number;
  extrasSum: number;
  before: number;
  discount: number;
  minApplied: boolean;
  /** Per visit if recurring. */
  total: number;
}

export function computeCleaning(input: CleaningInput): CleaningTotals {
  const mult = (input.multipliers ?? DEFAULT_CLEANING_MULTIPLIERS)[input.cleaningType];
  const minOrder = input.minOrder ?? DEFAULT_MIN_ORDER;

  let areaSub = 0;
  let areaCount = 0;
  for (const area of CLEANING_AREAS[input.propertyType]) {
    const q = input.qty[area.id] ?? 0;
    const price = input.areaPrices[area.id];
    if (!(q > 0) || price == null) continue;
    areaSub += q * price;
    areaCount += q;
  }
  const extrasSum = CLEANING_EXTRAS.filter((e) => input.extras.includes(e.id)).reduce(
    (s, e) => s + e.price,
    0,
  );
  const typeExtra = roundNaira(areaSub * (mult - 1));
  const before = roundNaira(areaSub * mult) + extrasSum;
  const discount = roundNaira(before * FREQUENCY_DISCOUNT[input.frequency]);
  const after = before - discount;
  const hasAreas = areaCount > 0;
  return {
    areaCount,
    areaSub,
    typeExtra,
    extrasSum,
    before,
    discount,
    minApplied: hasAreas && after < minOrder,
    total: hasAreas ? Math.max(minOrder, after) : 0,
  };
}
