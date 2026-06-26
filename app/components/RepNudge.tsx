import { UserCog } from "lucide-react";

// Shown to a rep on a lead/customer page until their own DMS leads flow. Never shows
// anyone else's book — that's the whole point.
export default function RepNudge({ what }: { what: string }) {
  return (
    <div className="card pad-lg">
      <div className="callout">
        <span className="ico"><UserCog /></span>
        <div>
          <strong>Your {what} show up here</strong>
          <div className="stat-sub" style={{ marginTop: 4 }}>
            COVE pulls your {what} from the dealership DMS by your employee number — they populate
            automatically once the live DMS connection is restored. Add the phone &amp; email your
            customers reach you on in <a className="card-link" href="/setup">Setup</a> so your texts and
            emails attribute to you.
          </div>
          <a className="btn primary mt" href="/setup"><UserCog size={15} /> Finish my setup</a>
        </div>
      </div>
    </div>
  );
}
