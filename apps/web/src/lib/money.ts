/** Turn database money errors into messages a customer can act on. */
export function friendlyMoneyError(message: string): string {
  if (message.includes("identity verification required")) return "Verify your identity first to add or withdraw money.";
  if (message.includes("insufficient")) return "Your wallet balance is too low. Top up and try again.";
  if (message.includes("already paid")) return "This order is already paid.";
  return message;
}

export const isLowBalance = (message: string | undefined) => !!message && message.includes("insufficient");
