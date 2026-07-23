"""
notify_disease_forecast.py
ตรวจสอบพยากรณ์ความเสี่ยงโรคข้าวรายแปลง แล้วส่ง LINE Notification
พร้อม forecast strip 6 วัน (อากาศ + อุณหภูมิ + ความเสี่ยงโรค)

cnt = จำนวนวันต่อเนื่องที่สภาพอากาศเอื้อต่อการระบาด
  1-2  → เริ่มเสี่ยง
  3-4  → เสี่ยงสูง
  5+   → เสี่ยงสูงมาก

Usage:
  python notify_disease_forecast.py <user_id> [--farm N] [--days N] [--send]

  --farm N   เลือกแปลงที่ N (index เริ่มต้นที่ 0, default: ทุกแปลง)
  --days N   จำนวนวันย้อนหลัง (default 21, max 60)
  --send     ส่งจริงผ่าน LINE
"""

import os, sys, json, requests
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(__file__))
from farm_carousel import get_farms, send_to_line
from messages import _growth_stage

NECTEC_BASE_URL = os.getenv("NEXT_PUBLIC_API_BASE_URL", "")
NECTEC_API_KEY  = os.getenv("NECTEC_API_KEY", "")

_THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
_SPARK       = "▁▂▃▄▅▆▇█"


# ─── Helpers ────────────────────────────────────────────────────────────────────

def _thai_date(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return f"{dt.day} {_THAI_MONTHS[dt.month - 1]}"
    except Exception:
        return date_str


def _severity(cnt: int) -> tuple[str, str, str]:
    if cnt >= 5: return "🔴", "เสี่ยงสูงมาก", "#b71c1c"
    if cnt >= 3: return "🟠", "เสี่ยงสูง",    "#e65100"
    return "🟡", "เริ่มเสี่ยง", "#f9a825"


def _weather_emoji(precip: float) -> str:
    if precip >= 15: return "⛈"
    if precip >= 5:  return "🌧"
    if precip >= 1:  return "🌦"
    return "☀"


def _risk_dot(blast: int, blb: int) -> str:
    m = max(blast, blb)
    if m >= 5: return "🔴"
    if m >= 3: return "🟠"
    if m >= 1: return "🟡"
    return "🟢"


def _sparkline(values: list[float]) -> str:
    if not values or max(values) == 0:
        return "▁" * len(values)
    hi = max(values)
    return "".join(_SPARK[min(7, round(v / hi * 7))] for v in values)


# ─── Fetch ──────────────────────────────────────────────────────────────────────

def fetch_forecast(farm: dict, historic_days: int = 21) -> list:
    lat = farm.get("latitude")
    lon = farm.get("longitude")
    if not lat or not lon:
        return []
    res = requests.get(
        f"{NECTEC_BASE_URL}/ricefit_forecast",
        headers={"accept": "application/json", "apikey": NECTEC_API_KEY},
        params={"lat": lat, "lon": lon, "historic_days": historic_days},
        timeout=15,
    )
    if not res.ok:
        raise ValueError(f"forecast error {res.status_code}: {res.text[:300]}")
    return res.json().get("records", [])


# ─── Risk analysis ──────────────────────────────────────────────────────────────

def analyze_risk(records: list, min_cnt: int = 1) -> dict | None:
    today  = date.today().isoformat()
    future = [r for r in records if r.get("date", "") >= today]
    result = {}
    for key, label in [("cnt_blast_disease", "โรคใบไหม้"),
                       ("cnt_blb_disease",   "โรคขอบใบแห้ง")]:
        risky = [r for r in future if r.get(key, 0) >= min_cnt]
        if risky:
            result[key] = {
                "label":   label,
                "onset":   risky[0]["date"],
                "max_cnt": max(r[key] for r in risky),
            }
    return result if result else None


# ─── Temperature / growth-stage risk (จาก weather_utils, คนละแหล่งข้อมูลกับโรค) ───

# stage_idx (จาก _growth_stage) → (คอลัมน์ risk, label) เฉพาะระยะปัจจุบันของแปลง
GROWTH_STAGE_RISK = {
    0: ("cnt_sd_risk",  "เสี่ยงอุณหภูมิผิดปกติ (ระยะตกกล้า)"),
    1: ("cnt_gw1_risk", "เสี่ยงอุณหภูมิผิดปกติ (ระยะแตกกอ)"),
    2: ("cnt_gw2_risk", "เสี่ยงเป็นหมัน (ระยะตั้งท้อง)"),
    3: ("cnt_flw_risk", "เสี่ยงเป็นหมัน (ระยะออกรวง)"),
    4: ("cnt_hvs_risk", "เสี่ยงคุณภาพเมล็ดลดลง (ระยะเก็บเกี่ยว)"),
}


def analyze_growth_risk(records: list, stage_idx: int | None) -> dict | None:
    """เช็คความเสี่ยงหนาว/ร้อนทั่วไป + ความเสี่ยงเฉพาะระยะการเจริญเติบโตปัจจุบันของแปลง"""
    today  = date.today().isoformat()
    future = [r for r in records if r.get("date", "") >= today]
    result = {}

    lt_risky = [r for r in future if r.get("cnt_lt_risk", 0) >= 3]
    if lt_risky:
        result["cnt_lt_risk"] = {
            "label": "เสี่ยงอากาศหนาวเย็นต่อเนื่อง",
            "onset": lt_risky[0]["date"],
            "max_cnt": max(r["cnt_lt_risk"] for r in lt_risky),
        }

    ht_risky = [r for r in future if r.get("cnt_ht_risk", 0) >= 1]
    if ht_risky:
        result["cnt_ht_risk"] = {
            "label": "เสี่ยงอากาศร้อนจัด",
            "onset": ht_risky[0]["date"],
            "max_cnt": max(r["cnt_ht_risk"] for r in ht_risky),
        }

    if stage_idx in GROWTH_STAGE_RISK:
        key, label = GROWTH_STAGE_RISK[stage_idx]
        risky = [r for r in future if r.get(key, 0) >= 1]
        if risky:
            result[key] = {"label": label, "onset": risky[0]["date"], "max_cnt": max(r[key] for r in risky)}

    return result if result else None


def build_growth_risk_bubble(farm: dict, risk: dict, records: list) -> dict:
    farm_name = farm.get("farm_name") or "ไม่ระบุชื่อ"
    max_cnt   = max(v["max_cnt"] for v in risk.values())
    header_color = (
        "#b71c1c" if max_cnt >= 5 else
        "#e65100" if max_cnt >= 3 else
        "#f9a825"
    )

    rows = []
    for key, info in risk.items():
        emoji, _, dc = _severity(info["max_cnt"])
        rows.append({
            "type": "box", "layout": "vertical", "margin": "sm",
            "contents": [
                {
                    "type": "box", "layout": "horizontal", "alignItems": "center",
                    "contents": [
                        {"type": "text", "text": f"{emoji}  {info['label']}",
                         "size": "sm", "weight": "bold", "color": "#333333", "flex": 1, "wrap": True},
                        {"type": "text", "text": f"{info['max_cnt']} วัน",
                         "size": "sm", "weight": "bold", "color": dc, "flex": 0},
                    ],
                },
                {
                    "type": "box", "layout": "horizontal", "alignItems": "center",
                    "spacing": "sm", "margin": "xs",
                    "contents": [
                        _dot_bar(records, key),
                        {"type": "text", "text": f"เริ่ม {_thai_date(info['onset'])}",
                         "size": "xs", "color": "#aaaaaa", "flex": 0},
                    ],
                },
            ],
        })

    return {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": header_color, "paddingAll": "12px",
            "contents": [
                {"type": "text", "text": "🌡 แจ้งเตือนอุณหภูมิผิดปกติ",
                 "color": "#ffffff", "weight": "bold", "size": "md"},
                {"type": "text", "text": farm_name,
                 "color": "#ffffff99", "size": "xs"},
            ],
        },
        "body": {
            "type": "box", "layout": "vertical",
            "paddingAll": "12px", "spacing": "sm",
            "contents": [
                {"type": "text", "text": "⚠️ ความเสี่ยงจากอุณหภูมิที่พบ",
                 "weight": "bold", "size": "sm", "color": "#333333"},
                *rows,
                {"type": "separator", "margin": "sm", "color": "#eeeeee"},
                {"type": "text",
                 "text": "💡 แนะนำ: ติดตามสภาพอากาศและเตรียมมาตรการรับมือ",
                 "size": "xs", "color": "#555555", "wrap": True, "margin": "sm"},
            ],
        },
    }


def build_growth_alert_messages(alert_farms: list[tuple]) -> list:
    """alert_farms: list of (farm, risk, records) — risk จาก analyze_growth_risk"""
    bubbles = [build_growth_risk_bubble(f, r, recs) for f, r, recs in alert_farms]
    names   = "、".join((f.get("farm_name") or "ไม่ระบุชื่อ") for f, *_ in alert_farms)
    n       = len(alert_farms)
    return [
        {"type": "text",
         "text": f"🌡 แจ้งเตือนอุณหภูมิผิดปกติ: พบความเสี่ยงใน {n} แปลง ({names}) ครับ"},
        {
            "type": "flex",
            "altText": f"แจ้งเตือนอุณหภูมิ {n} แปลง",
            "contents": (
                {"type": "carousel", "contents": bubbles}
                if len(bubbles) > 1 else bubbles[0]
            ),
        },
    ]


# ─── Dot bar ─────────────────────────────────────────────────────────────────────

def _dot_bar(records: list, key: str) -> dict:
    """7-dot row: สีตามระดับความเสี่ยงรายวัน ● สีแดง/ส้ม/เหลือง/เทา"""
    today    = date.today().isoformat()
    upcoming = [r for r in records if r.get("date", "") >= today][:7]
    dots = []
    for r in upcoming:
        cnt   = r.get(key, 0)
        color = (
            "#c62828" if cnt >= 5 else
            "#e65100" if cnt >= 3 else
            "#f9a825" if cnt >= 1 else
            "#dddddd"
        )
        dots.append({"type": "text", "text": "●", "size": "xs", "color": color, "flex": 0})
    return {"type": "box", "layout": "horizontal", "spacing": "xs", "contents": dots}


# ─── Forecast strip ──────────────────────────────────────────────────────────────

def _forecast_strip(records: list) -> list:
    """6-day strip: วันที่ / ไอคอนฝน / อุณหภูมิ / dot ความเสี่ยง + sparkline ฝน"""
    today    = date.today().isoformat()
    upcoming = [r for r in records if r.get("date", "") >= today][:6]
    if not upcoming:
        return []

    day_cols = []
    for r in upcoming:
        day   = datetime.strptime(r["date"], "%Y-%m-%d").day
        temp  = round(r.get("temperature_2m_avg", 0))
        pre   = r.get("precipitation", 0)
        blast = r.get("cnt_blast_disease", 0)
        blb   = r.get("cnt_blb_disease", 0)
        day_cols.append({
            "type": "box", "layout": "vertical", "flex": 1,
            "alignItems": "center", "spacing": "xs",
            "contents": [
                {"type": "text", "text": str(day),
                 "size": "xs", "align": "center", "color": "#888888"},
                {"type": "text", "text": _weather_emoji(pre),
                 "size": "sm", "align": "center"},
                {"type": "text", "text": f"{temp}°",
                 "size": "xs", "align": "center", "color": "#555555"},
                {"type": "text", "text": _risk_dot(blast, blb),
                 "size": "xs", "align": "center"},
            ],
        })

    precip_vals = [r.get("precipitation", 0) for r in upcoming]
    spark_str   = _sparkline(precip_vals)
    max_pre     = max(precip_vals)

    return [
        {"type": "separator", "margin": "sm", "color": "#eeeeee"},
        {"type": "text", "text": "📅 พยากรณ์ 6 วันข้างหน้า",
         "weight": "bold", "size": "sm", "color": "#333333", "margin": "sm"},
        {"type": "box", "layout": "horizontal",
         "margin": "sm", "contents": day_cols},
        {
            "type": "box", "layout": "horizontal",
            "margin": "xs", "spacing": "xs", "alignItems": "center",
            "contents": [
                {"type": "text", "text": "🌧",
                 "size": "xs", "flex": 0, "color": "#888888"},
                {"type": "text",
                 "text": f"{spark_str}  สูงสุด {max_pre:.1f} มม.",
                 "size": "xs", "color": "#888888", "flex": 1},
            ],
        },
    ]


# ─── Flex Message builder ────────────────────────────────────────────────────────

def build_alert_bubble(farm: dict, risk: dict, records: list) -> dict:
    farm_name = farm.get("farm_name") or "ไม่ระบุชื่อ"
    max_cnt   = max(v["max_cnt"] for v in risk.values())

    header_color = (
        "#b71c1c" if max_cnt >= 5 else
        "#e65100" if max_cnt >= 3 else
        "#f9a825"
    )

    disease_rows = []
    for key, info in risk.items():
        emoji, _, dc = _severity(info["max_cnt"])
        disease_rows.append({
            "type": "box", "layout": "vertical", "margin": "sm",
            "contents": [
                {
                    "type": "box", "layout": "horizontal", "alignItems": "center",
                    "contents": [
                        {"type": "text", "text": f"{emoji}  {info['label']}",
                         "size": "sm", "weight": "bold", "color": "#333333", "flex": 1},
                        {"type": "text", "text": f"{info['max_cnt']} วัน",
                         "size": "sm", "weight": "bold", "color": dc, "flex": 0},
                    ],
                },
                {
                    "type": "box", "layout": "horizontal", "alignItems": "center",
                    "spacing": "sm", "margin": "xs",
                    "contents": [
                        _dot_bar(records, key),
                        {"type": "text", "text": f"เริ่ม {_thai_date(info['onset'])}",
                         "size": "xs", "color": "#aaaaaa", "flex": 0},
                    ],
                },
            ],
        })

    body_contents = [
        {"type": "text", "text": "⚠️ ความเสี่ยงโรคที่พบ",
         "weight": "bold", "size": "sm", "color": "#333333"},
        *disease_rows,
        *_forecast_strip(records),
        {"type": "separator", "margin": "sm", "color": "#eeeeee"},
        {"type": "text",
         "text": "💡 แนะนำ: ตรวจแปลงและเตรียมป้องกันโรคล่วงหน้า",
         "size": "xs", "color": "#555555", "wrap": True, "margin": "sm"},
    ]

    return {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": header_color, "paddingAll": "12px",
            "contents": [
                {"type": "text", "text": "🌾 แจ้งเตือนโรคข้าว",
                 "color": "#ffffff", "weight": "bold", "size": "md"},
                {"type": "text", "text": farm_name,
                 "color": "#ffffff99", "size": "xs"},
            ],
        },
        "body": {
            "type": "box", "layout": "vertical",
            "paddingAll": "12px", "spacing": "sm",
            "contents": body_contents,
        },
    }


def build_alert_messages(alert_farms: list[tuple]) -> list:
    bubbles = [build_alert_bubble(f, r, recs) for f, r, recs in alert_farms]
    names   = "、".join((f.get("farm_name") or "ไม่ระบุชื่อ") for f, *_ in alert_farms)
    n       = len(alert_farms)
    return [
        {"type": "text",
         "text": f"⚠️ แจ้งเตือนโรคข้าว: พบความเสี่ยงใน {n} แปลง ({names}) ครับ"},
        {
            "type": "flex",
            "altText": f"แจ้งเตือนโรคข้าว {n} แปลง",
            "contents": (
                {"type": "carousel", "contents": bubbles}
                if len(bubbles) > 1 else bubbles[0]
            ),
        },
    ]


def build_combined_alert_messages(disease_alerts: list[tuple], growth_alerts: list[tuple]) -> list:
    """รวมการ์ดโรค (build_alert_bubble) และการ์ดอุณหภูมิ (build_growth_risk_bubble) ของทุกแปลง
    เป็นข้อความสรุปเดียว + carousel เดียว แทนที่จะส่งแยกเป็นสองชุด"""
    bubbles = (
        [build_alert_bubble(f, r, recs) for f, r, recs in disease_alerts]
        + [build_growth_risk_bubble(f, r, recs) for f, r, recs in growth_alerts]
    )
    if not bubbles:
        return []

    farm_names = list(dict.fromkeys(
        (f.get("farm_name") or "ไม่ระบุชื่อ") for f, *_ in (disease_alerts + growth_alerts)
    ))
    names = "、".join(farm_names)

    return [
        {"type": "text",
         "text": f"⚠️ แจ้งเตือนความเสี่ยง: พบความเสี่ยงใน {len(farm_names)} แปลง ({names}) ครับ"},
        {
            "type": "flex",
            "altText": f"แจ้งเตือนความเสี่ยง {len(bubbles)} รายการ",
            "contents": (
                {"type": "carousel", "contents": bubbles}
                if len(bubbles) > 1 else bubbles[0]
            ),
        },
    ]


# ─── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args      = sys.argv[1:]
    user_id   = next((a for a in args if not a.startswith("--")), "mock_user_123")
    send_msg  = "--send" in args
    hist_days = 21
    farm_idx  = None  # None = ทุกแปลง

    if "--days" in args:
        di = args.index("--days")
        if di + 1 < len(args):
            hist_days = int(args[di + 1])

    if "--farm" in args:
        fi = args.index("--farm")
        if fi + 1 < len(args):
            farm_idx = int(args[fi + 1])

    print(f"[INFO] user={user_id}  historic_days={hist_days}  farm_idx={farm_idx}\n")

    all_farms = get_farms(user_id)
    if not all_farms:
        print("[WARN] ไม่พบแปลงนา")
        sys.exit(0)

    farms = [all_farms[farm_idx]] if farm_idx is not None else all_farms

    alert_farms = []
    for farm in farms:
        farm_name = farm.get("farm_name") or "ไม่ระบุชื่อ"
        try:
            records = fetch_forecast(farm, hist_days)
            risk    = analyze_risk(records)
        except Exception as e:
            print(f"[WARN] {farm_name}: {e}")
            continue

        if risk:
            labels = ", ".join(v["label"] for v in risk.values())
            print(f"[ALERT] {farm_name}: {labels}")
            alert_farms.append((farm, risk, records))
        else:
            print(f"[OK]    {farm_name}: ไม่พบความเสี่ยงในช่วงนี้")

    if not alert_farms:
        print("\n[INFO] ทุกแปลงปลอดภัย ไม่มีการส่งแจ้งเตือน")
        sys.exit(0)

    messages = build_alert_messages(alert_farms)

    if send_msg:
        print(f"\n[INFO] กำลังส่งผ่าน LINE ({len(alert_farms)} แปลงที่มีความเสี่ยง)...")
        result = send_to_line(user_id, messages)
        print("[OK]", result)
    else:
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        print(f"\n[TIP] เพิ่ม --send เพื่อส่งจริง")
