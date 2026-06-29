import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getTeam, getStoreLeads } from "../lib/data";
import { PageHead } from "../components/ui";
import TeamTable from "../components/TeamTable";

export const dynamic = "force-dynamic";

// The owner's employee-zoom tab: the whole roster, click anyone to drill in. Admin/owner only.
export default function TeamPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/");
  const team = getTeam();
  const store = getStoreLeads();
  return (
    <>
      <PageHead
        title="Team"
        sub={`Every manager and salesperson — click anyone to zoom in. ${store.activeTotal.toLocaleString()} active leads store-wide across ${store.reps} reps.`}
      />
      <TeamTable month={team.month} members={team.members} totals={team.totals} />
    </>
  );
}
