import { UserCog, CheckCircle2 } from "lucide-react";
import { currentUser } from "../lib/auth";
import { getUserProfile } from "../lib/user-profile";
import { getSendingStatus } from "../lib/user-sending";

// Shown to a rep on a lead/customer page until their own DMS leads flow. Never shows anyone else's
// book — that's the whole point. Once the rep has finished setup (saved a phone/email or connected
// Gmail) it stops nagging "Finish my setup" and just explains their leads will populate.
export default function RepNudge({ what }: { what: string }) {
  const me = currentUser();
  const prof = me ? getUserProfile(me.slug) : { phones: [], emails: [] };
  const sending = me ? getSendingStatus(me.slug) : { gmailUser: "", hasPassword: false };
  const setupDone = prof.phones.length > 0 || prof.emails.length > 0 || !!sending.hasPassword;

  if (setupDone) {
    return (
      <div className="card pad-lg">
        <div className="callout">
          <span className="ico"><CheckCircle2 /></span>
          <div>
            <strong>You're all set — your {what} show up here</strong>
            <div className="stat-sub" style={{ marginTop: 4 }}>
              COVE pulls your {what} from the dealership DMS by your name and employee number. They
              populate automatically as leads come in under you — nothing else to do. You can update your
              contact info anytime in <a className="card-link" href="/setup">Setup</a>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card pad-lg">
      <div className="callout">
        <span className="ico"><UserCog /></span>
        <div>
          <strong>Your {what} show up here</strong>
          <div className="stat-sub" style={{ marginTop: 4 }}>
            COVE pulls your {what} from the dealership DMS by your employee number — they populate
            automatically. Add the phone &amp; email your customers reach you on in{" "}
            <a className="card-link" href="/setup">Setup</a> so your texts and emails attribute to you.
          </div>
          <a className="btn primary mt" href="/setup"><UserCog size={15} /> Finish my setup</a>
        </div>
      </div>
    </div>
  );
}
