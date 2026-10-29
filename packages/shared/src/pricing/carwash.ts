export type CarWashPackage = "exterior" | "full" | "detailing";
export type VehicleType = "saloon" | "suv" | "van" | "pickup";

export interface CarWashRate {
  customerPrice: number;
  partnerPayout: number;
}

/** Admin-set; keyed `${package}:${vehicle}`. */
export type CarWashRates = Record<string, CarWashRate>;

export interface CarWashQuote {
  price: number;
  serviceFee: number;
  total: number;
  partnerPayout: number;
}

/** Customer is only charged once a partner is assigned; this is the quote. */
export function quoteCarWash(
  rates: CarWashRates,
  pkg: CarWashPackage,
  vehicle: VehicleType,
  serviceFee: number,
  mobile: boolean,
  mobileBonus = 0,
): CarWashQuote | null {
  const r = rates[`${pkg}:${vehicle}`];
  if (!r) return null;
  return {
    price: r.customerPrice,
    serviceFee,
    total: r.customerPrice + serviceFee,
    partnerPayout: r.partnerPayout + (mobile ? mobileBonus : 0),
  };
}
