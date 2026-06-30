import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getAllOverrides } from "../lib/overrides";
import { contactsReady, getBuyers } from "../lib/contacts";
import { PageHead } from "../components/ui";
import RepNudge from "../components/RepNudge";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // The contacts index is the owner's personal phone book (35k) — never expose it to other reps.
  if (!me.isAdmin) return (<><PageHead title="Contacts" sub="Your contacts" /><RepNudge what="contacts" /></>);
  return (
    <>
      <PageHead title="Contacts" sub="Your rolodex — past buyers with what they bought, your whole phone book, and quick add / fix" />
      <ContactsClient initial={getAllOverrides()} indexReady={contactsReady()} buyers={getBuyers()} />
    </>
  );
}
