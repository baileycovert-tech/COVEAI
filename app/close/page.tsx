import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { listJackets, getRouting } from "../lib/deal-jackets";
import { PageHead } from "../components/ui";
import CloseDealForm from "./CloseDealForm";

export const dynamic = "force-dynamic";

export default function CloseDealPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  return (
    <>
      <PageHead
        title="Close a deal"
        sub="Fill the packet, approve it, and send to desk → finance — without leaving COVE."
      />
      <CloseDealForm
        jackets={listJackets(me.slug, me.isAdmin)}
        routing={getRouting()}
      />
    </>
  );
}
