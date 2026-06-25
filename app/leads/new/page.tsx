import { currentUser } from "../../lib/auth";
import LeadForm from "./LeadForm";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
  const me = currentUser();
  return <LeadForm isAdmin={!!me?.isAdmin} repFirst={(me?.name || "").split(" ")[0]} />;
}
