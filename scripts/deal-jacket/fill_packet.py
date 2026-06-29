#!/usr/bin/env python3
"""
Fills a Ford New or Used Vehicle deal packet PDF with deal data.

Key invariants (DO NOT CHANGE):
  - auto_regenerate=False on PdfWriter
  - /NeedAppearances=True on the AcroForm
  - Walk /Fields tree directly (update_page_form_field_values misses many fields)
  - For Used packets: inject 13 VIN-verification widgets on page 8 (no native fields there)
  - DEALER_* fields are pre-baked into the blanks — never re-fill them
"""

from __future__ import annotations
import sys
from pathlib import Path
from datetime import datetime
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    NameObject, BooleanObject, TextStringObject, ArrayObject,
    DictionaryObject, FloatObject, NumberObject, IndirectObject,
)

# ──────────────────────────────────────────────────────────────────
# Template paths
# ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # covert-crm/
TEMPLATE_NEW = PROJECT_ROOT / "templates" / "Ford_New_Packet_BLANK.pdf"
TEMPLATE_USED = PROJECT_ROOT / "templates" / "Used_Vehicles_Packet_BLANK.pdf"
OUTPUT_DIR = PROJECT_ROOT / "data" / "filled-packets"

# ──────────────────────────────────────────────────────────────────
# VIN-verification widgets (Used packet, page 8) — calibrated coords
# Format: (field_name, [x1, y1, x2, y2], font_size, alignment)
#   alignment: 0=left, 1=center, 2=right
# ──────────────────────────────────────────────────────────────────
VIN_VERIFY_WIDGETS = [
    ("VIN_VERIFY_SOLD_VIN",    [100, 612, 510, 632], 10, 1),
    ("VIN_VERIFY_SOLD_YEAR",   [110, 549, 195, 567],  9, 0),
    ("VIN_VERIFY_SOLD_MAKE",   [215, 549, 320, 567],  9, 0),
    ("VIN_VERIFY_SOLD_MODEL",  [340, 549, 450, 567],  9, 0),
    ("VIN_VERIFY_SOLD_STOCK",  [470, 549, 560, 567],  9, 0),
    ("VIN_VERIFY_SOLD_COLOR",  [110, 485, 240, 503],  9, 0),
    ("VIN_VERIFY_SOLD_MILES",  [260, 485, 380, 503],  9, 0),
    ("VIN_VERIFY_TRADE_VIN",   [100, 380, 510, 400], 10, 1),
    ("VIN_VERIFY_TRADE_YEAR",  [110, 317, 195, 335],  9, 0),
    ("VIN_VERIFY_TRADE_MAKE",  [215, 317, 320, 335],  9, 0),
    ("VIN_VERIFY_TRADE_MODEL", [340, 317, 450, 335],  9, 0),
    ("VIN_VERIFY_TRADE_COLOR", [110, 253, 240, 271],  9, 0),
    ("VIN_VERIFY_TRADE_MILES", [260, 253, 380, 271],  9, 0),
]

# Standard constants
SALESPERSON_FULL_NAME = "Bailey Covert"


def build_field_map(deal: dict) -> dict[str, str]:
    """Maps deal data → exact AcroForm field names in the packet templates."""
    v = deal.get("vehicle", {})
    c = deal.get("customer", {})
    today = datetime.now().strftime("%m/%d/%Y")
    full_name = f"{c.get('first_name','').strip()} {c.get('last_name','').strip()}".strip()

    return {
        "CURRENT_DATE": today,
        "CUSTOMER_FIRST_NAME": c.get("first_name", ""),
        "CUSTOMER_LAST_NAME": c.get("last_name", ""),
        "CUSTOMER_FULL_NAME": full_name,
        "CUSTOMER_BUSINESS_OR_FULL_NAME": c.get("business_name") or full_name,
        "CUSTOMER_ADDRESS": c.get("address", ""),
        "CUSTOMER_CITY": c.get("city", ""),
        "CUSTOMER_STATE": c.get("state", ""),
        "CUSTOMER_ZIP": c.get("zip", ""),
        "CUSTOMER_PHONE": c.get("phone", ""),
        "CUSTOMER_EMAIL": c.get("email", ""),
        "CUSTOMER_DOB": c.get("dob", ""),
        "CUSTOMER_DL_NUMBER": c.get("dl_number", ""),
        "VEHICLE_YEAR": str(v.get("year", "")),
        "VEHICLE_MAKE": v.get("make", "").upper(),
        "VEHICLE_MODEL": v.get("model", ""),
        "VEHICLE_VIN": v.get("vin", ""),
        "VEHICLE_STOCKNUM": v.get("stock", ""),
        "SALESPERSON_FULL_NAME": SALESPERSON_FULL_NAME,
    }


def fill_packet(deal: dict) -> Path:
    """
    Fills the appropriate blank packet for the given deal.

    deal = {
      "type": "new" | "used",
      "customer": {first_name, last_name, address, city, state, zip, phone, email, dob, dl_number, business_name?},
      "vehicle": {year, make, model, vin, stock, color?, miles?},
      "trade":   {vin?, year?, make?, model?, color?, miles?},  # optional
      "deal_number": str,
    }
    Returns path to the filled PDF.
    """
    deal_type = deal.get("type", "new").lower()
    template = TEMPLATE_NEW if deal_type == "new" else TEMPLATE_USED
    if not template.exists():
        raise FileNotFoundError(f"Missing template: {template}")

    reader = PdfReader(str(template))
    writer = PdfWriter(clone_from=reader)

    field_map = build_field_map(deal)

    # ─── Walk /Fields tree and set values ───
    def walk_fields(arr):
        for ref in arr:
            o = ref.get_object() if hasattr(ref, "get_object") else ref
            if "/Kids" in o:
                walk_fields(o["/Kids"])
            t = str(o.get("/T") or "")
            if t in field_map and field_map[t]:
                o[NameObject("/V")] = TextStringObject(field_map[t])

    catalog = writer._root_object
    if "/AcroForm" not in catalog:
        raise RuntimeError("Template has no AcroForm — wrong PDF?")
    acroform = catalog["/AcroForm"]
    if isinstance(acroform, IndirectObject):
        acroform = acroform.get_object()
    walk_fields(acroform["/Fields"])

    # ─── For Used packet: inject VIN-verification widgets on page 8 ───
    if deal_type == "used":
        _inject_vin_verify_widgets(writer, acroform, deal)

    # CRITICAL — both flags
    acroform[NameObject("/NeedAppearances")] = BooleanObject(True)

    # ─── Save ───
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_name = (
        f"{deal['customer']['last_name']}_"
        f"{deal['vehicle']['stock']}_"
        f"{'FordNew' if deal_type == 'new' else 'Used'}_Packet_"
        f"{datetime.now().strftime('%Y-%m-%d')}.pdf"
    )
    out_path = OUTPUT_DIR / out_name
    with open(out_path, "wb") as f:
        writer.write(f)

    return out_path


def _inject_vin_verify_widgets(writer, acroform, deal):
    """Injects 13 text-input widgets onto page 8 of the Used packet."""
    v = deal.get("vehicle", {})
    t = deal.get("trade", {})

    values = {
        "VIN_VERIFY_SOLD_VIN":   v.get("vin", ""),
        "VIN_VERIFY_SOLD_YEAR":  str(v.get("year", "")),
        "VIN_VERIFY_SOLD_MAKE":  v.get("make", "").upper(),
        "VIN_VERIFY_SOLD_MODEL": v.get("model", ""),
        "VIN_VERIFY_SOLD_STOCK": v.get("stock", ""),
        "VIN_VERIFY_SOLD_COLOR": v.get("color", ""),
        "VIN_VERIFY_SOLD_MILES": str(v.get("miles", "")),
        "VIN_VERIFY_TRADE_VIN":   t.get("vin", ""),
        "VIN_VERIFY_TRADE_YEAR":  str(t.get("year", "")) if t.get("year") else "",
        "VIN_VERIFY_TRADE_MAKE":  t.get("make", "").upper() if t.get("make") else "",
        "VIN_VERIFY_TRADE_MODEL": t.get("model", ""),
        "VIN_VERIFY_TRADE_COLOR": t.get("color", ""),
        "VIN_VERIFY_TRADE_MILES": str(t.get("miles", "")) if t.get("miles") else "",
    }

    page8 = writer.pages[7]
    page8_ref = page8.indirect_reference

    if "/Annots" not in page8:
        page8[NameObject("/Annots")] = ArrayObject()
    annots = page8["/Annots"]

    for name, rect, font_size, align in VIN_VERIFY_WIDGETS:
        widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/V"): TextStringObject(values.get(name, "")),
            NameObject("/Rect"): ArrayObject([FloatObject(x) for x in rect]),
            NameObject("/F"): NumberObject(4),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/Q"): NumberObject(align),
            NameObject("/DA"): TextStringObject(f"/Helv {font_size} Tf 0 g"),
            NameObject("/P"): page8_ref,
        })
        widget_ref = writer._add_object(widget)
        annots.append(widget_ref)
        acroform["/Fields"].append(widget_ref)


if __name__ == "__main__":
    # Smoke test: fill a sample deal
    import json
    sample = json.loads(sys.stdin.read())
    out = fill_packet(sample)
    print(f"Filled: {out}")
