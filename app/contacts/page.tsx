import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getAllOverrides } from "../lib/overrides";
import { contactsReady } from "../lib/contacts";
import { PageHead } from "../components/ui";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  if (!currentUser()) redirect("/login");
  return (
    <>
      <PageHead title="Contacts" sub="Add or fix a phone number / email — your entry wins everywhere COVE shows that contact" />
      <ContactsClient initial={getAllOverrides()} indexReady={contactsReady()} />
    </>
  );
}
