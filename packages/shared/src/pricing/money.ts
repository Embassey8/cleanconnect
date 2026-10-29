/** All money is integer naira. */
export const formatNaira = (n: number): string =>
  "₦" + Math.round(n).toLocaleString("en-NG");

/** Round a computed amount to whole naira. */
export const roundNaira = (n: number): number => Math.round(n);
