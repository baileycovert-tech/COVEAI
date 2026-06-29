import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getAllOverrides } from "../lib/overrides";
import { contactsReady } from "../lib/contacts";
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
      <PageHead title="Contacts" sub="Add or fix a phone number / email — your entry wins everywhere COVE shows that contact" />
      <ContactsClient initial={getAllOverrides()} indexReady={contactsReady()} />
    </>
  );
}
