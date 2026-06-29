import { redirect } from "next/navigation";
import { currentUser, getUserBySlug } from "../lib/auth";
import { getUserProfile } from "../lib/user-profile";
import { getSendingStatus } from "../lib/user-sending";
import { PageHead } from "../components/ui";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  const u = getUserBySlug(me.slug);
  const profile = getUserProfile(me.slug);
  return (
    <>
      <PageHead
        title="Your setup"
        sub={`Connect your phone & email so COVE pulls YOUR leads, ${me.name.split(/\s+/)[0]}`}
      />
      <SetupForm name={me.name} s1Ford={u?.fordS1 || null} s1Chevy={u?.chevyS1 || null} initial={profile} sending={getSendingStatus(me.slug)} />
    </>
  );
}
