import { redirect } from "next/navigation";

/** Orders now live on the Overview page, in tabs. */
export default function ProviderOrdersRedirect() {
  redirect("/provider");
}
