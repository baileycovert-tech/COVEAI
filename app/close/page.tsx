import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { customersFor } from "../lib/data";
import { listJackets, getRouting } from "../lib/deal-jackets";
import { PageHead } from "../components/ui";
import CloseDealForm from "./CloseDealForm";

export const dynamic = "force-dynamic";

export default function CloseDealPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // The customer picker is scoped to the viewer (their own book / leads), same isolation as everywhere.
  const customers = customersFor(me).map((c) => ({
    slug: c.slug, name: c.name, phone: c.phone || "", email: c.email || "", vehicle: c.vehicle_interest || "",
  }));
  return (
    <>
      <PageHead
        title="Close a deal"
        sub="Pull up a customer to auto-fill, finish the details, then send to desk → finance — without leaving COVE."
      />
      <CloseDealForm
        jackets={listJackets(me.slug, me.isAdmin)}
        routing={getRouting()}
        customers={customers}
      />
    </>
  );
}
