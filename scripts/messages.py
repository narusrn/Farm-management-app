"""
messages.py
Pure LINE Flex Message builders — ไม่มี API calls, ไม่มี I/O
รับ data dict แล้วคืน LINE Flex dict

Exports:
  build_farm_bubble(farm, select_mode=None)
  build_ricefit_bubble(farm, ricefit_data, check_type)
"""

from datetime import datetime, date

LIFF_URL = "https://farm-management-app-mu.vercel.app"

STAGE_META = [
    {"label": "ตกกล้า",      "emoji": "🌱", "color": "#2e7d32", "light": "#e8f5e9", "bar": "#66bb6a"},
    {"label": "แตกกอ",       "emoji": "🌿", "color": "#1b5e20", "light": "#c8e6c9", "bar": "#43a047"},
    {"label": "ตั้งท้อง",   "emoji": "🪴", "color": "#558b2f", "light": "#f0f4c3", "bar": "#9ccc65"},
    {"label": "ออกรวง",      "emoji": "🌾", "color": "#e65100", "light": "#fff3e0", "bar": "#ffa726"},
    {"label": "เก็บเกี่ยว", "emoji": "🍚", "color": "#bf360c", "light": "#fce4ec", "bar": "#ef5350"},
]
DONE_META = {"label": "ครบฤดูกาล", "emoji": "🍚", "color": "#4e342e", "light": "#efebe9", "bar": "#a1887f"}

RISK_KEYS = [
    "ดินเปรี้ยว", "ดินเค็ม", "แล้ง", "น้ำท่วมฉับพลัน",
    "โรคขอบใบแห้ง", "โรคใบไหม้", "ระยะข้าว", "อุณหภูมิสูง", "อุณหภูมิต่ำ",
]

_THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


# ─── Helpers ────────────────────────────────────────────────────────────────────

def _thai_date(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return f"{dt.day} {_THAI_MONTHS[dt.month - 1]} {dt.year + 543}"
    except Exception:
        return date_str or "-"


def _growth_stage(planting_date_str: str, sensitivity: str):
    """Returns (stage_idx, days, total_days) or (None, None, None)."""
    try:
        planting = datetime.strptime(planting_date_str, "%Y-%m-%d").date()
        days = (date.today() - planting).days
        if days < 0:
            return None, None, None
        thresholds = (
            [30, 90, 150, 200, 240] if sensitivity == "ไวแสง"
            else [15, 45, 75, 105, 120]
        )
        idx = next((i for i, limit in enumerate(thresholds) if days <= limit), None)
        return (idx, days, thresholds[-1]) if idx is not None else (5, days, thresholds[-1])
    except Exception:
        return None, None, None



# ─── Public builders ─────────────────────────────────────────────────────────────

def build_farm_bubble(farm: dict, select_mode: str | None = None, postback: bool = False) -> dict:
    """Single farm card bubble. select_mode: 'soil'|'risk'|None. postback: use postback action instead of URI."""
    farm_id       = farm.get("id") or farm.get("farm_id", "")
    farm_name     = farm.get("farm_name") or "ไม่ระบุชื่อ"
    rice_variety  = farm.get("rice_variety") or "ไม่ระบุ"
    planting_date = farm.get("planting_date") or ""
    sensitivity   = farm.get("sensitivity") or "ไม่ไวแสง"
    lat           = farm.get("latitude")
    lon           = farm.get("longitude")
    diseases      = farm.get("notification_diseases") or []

    stage_idx, days, total_days = _growth_stage(planting_date, sensitivity)

    if stage_idx is None:
        meta, filled_pct, subtitle = STAGE_META[0], 0.0, "-"
    elif stage_idx >= 5:
        meta, filled_pct, subtitle = DONE_META, 1.0, "ครบฤดูกาลแล้ว"
    else:
        meta       = STAGE_META[stage_idx]
        filled_pct = min(days / total_days, 1.0)
        subtitle   = f"{meta['label']}  ·  วันที่ {days} / {total_days}"

    header_color = meta["color"]
    bar_color    = meta["bar"]
    stage_emoji  = meta["emoji"]

    map_uri  = f"https://www.google.com/maps?q={lat},{lon}" if lat and lon else "https://www.google.com/maps"
    liff_uri = f"{LIFF_URL}?check={select_mode}&farm_id={farm_id}" if select_mode else LIFF_URL

    # ── Stage timeline ──────────────────────────────────────────────────────────
    all_done = stage_idx is not None and stage_idx >= 5
    timeline_cols = []
    for i, s in enumerate(STAGE_META):
        is_current = not all_done and stage_idx is not None and i == stage_idx
        is_past    = all_done or (stage_idx is not None and i < stage_idx)
        emoji_color = "#222222" if (is_current or is_past) else "#cccccc"
        label_color = bar_color if is_current else ("#999999" if is_past else "#cccccc")
        timeline_cols.append({
            "type": "box", "layout": "vertical",
            "flex": 1, "alignItems": "center", "spacing": "xs",
            "contents": [
                {"type": "text", "text": s["emoji"],
                 "align": "center",
                 "size": "lg" if is_current else "sm",
                 "color": emoji_color},
                {"type": "text", "text": s["label"],
                 "align": "center", "size": "xxs",
                 "color": label_color, "wrap": True},
            ],
        })

    # ── Progress bar in header (white tones) ────────────────────────────────────
    filled_w = max(1, round(filled_pct * 100))
    empty_w  = 100 - filled_w
    header_bar_parts = [{
        "type": "box", "layout": "vertical", "flex": filled_w,
        "backgroundColor": "#ffffff99", "cornerRadius": "3px",
        "contents": [{"type": "filler"}],
    }]
    if empty_w > 0:
        header_bar_parts.append({
            "type": "box", "layout": "vertical", "flex": empty_w,
            "backgroundColor": "#ffffff33", "cornerRadius": "3px",
            "contents": [{"type": "filler"}],
        })
    header_progress = {
        "type": "box", "layout": "horizontal",
        "height": "4px", "cornerRadius": "3px", "margin": "md",
        "contents": header_bar_parts,
    }

    # ── Disease badges ──────────────────────────────────────────────────────────
    disease_map = {
        "blight": ("🟠 โรคขอบใบแห้ง", "#e65100"),
        "blast":  ("🔴 โรคไหม้",       "#c62828"),
    }
    disease_tags = [
        {"type": "text", "text": label, "size": "xxs",
         "color": color, "flex": 0}
        for d in diseases
        if d in disease_map
        for label, color in [disease_map[d]]
    ]

    # ── Body ────────────────────────────────────────────────────────────────────
    def info_row(icon: str, label: str, value: str) -> dict:
        return {
            "type": "box", "layout": "horizontal",
            "spacing": "sm", "alignItems": "center",
            "contents": [
                {"type": "text", "text": icon, "size": "xs", "flex": 0},
                {"type": "text", "text": label, "size": "xs",
                 "color": "#888888", "flex": 1},
                {"type": "text", "text": value, "size": "xs",
                 "color": "#333333", "weight": "bold",
                 "flex": 0, "align": "end"},
            ],
        }

    body_contents: list = [
        {"type": "box", "layout": "horizontal",
         "contents": timeline_cols},
        {"type": "separator", "margin": "md", "color": "#eeeeee"},
        info_row("📅", "วันปลูก", _thai_date(planting_date)),
        info_row("🌾", "พันธุ์ข้าว", rice_variety),
    ]
    if disease_tags:
        body_contents += [
            {"type": "separator", "margin": "sm", "color": "#eeeeee"},
            {"type": "box", "layout": "horizontal",
             "margin": "sm", "spacing": "md",
             "contents": disease_tags},
        ]

    # ── Footer ──────────────────────────────────────────────────────────────────
    if select_mode:
        if postback:
            select_action = {
                "type": "postback",
                "label": "✅ เลือกแปลงนี้",
                "data": f"check={select_mode}&farm_id={farm_id}",
                "displayText": f"เลือกแปลง {farm_name}",
            }
        else:
            select_action = {"type": "uri", "label": "✅ เลือกแปลงนี้", "uri": liff_uri}
        footer_contents = [
            {"type": "button", "style": "primary", "color": header_color,
             "height": "sm", "flex": 3, "action": select_action},
            {"type": "button", "style": "secondary", "height": "sm", "flex": 1,
             "action": {"type": "uri", "label": "📍", "uri": map_uri}},
        ]
    else:
        footer_contents = [
            {"type": "button", "style": "primary", "color": header_color,
             "height": "sm", "flex": 1,
             "action": {"type": "uri", "label": "สภาพดิน",
                        "uri": f"{LIFF_URL}?check=soil&farm_id={farm_id}"}},
            {"type": "button", "style": "secondary", "height": "sm", "flex": 1,
             "action": {"type": "uri", "label": "ความเสี่ยง",
                        "uri": f"{LIFF_URL}?check=risk&farm_id={farm_id}"}},
        ]

    return {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": header_color,
            "paddingAll": "14px", "paddingBottom": "12px",
            "contents": [
                {
                    "type": "box", "layout": "horizontal", "alignItems": "center",
                    "contents": [
                        {
                            "type": "box", "layout": "vertical", "flex": 1,
                            "contents": [
                                {"type": "text", "text": farm_name, "weight": "bold",
                                 "size": "md", "color": "#ffffff", "wrap": True},
                                {"type": "text", "text": subtitle, "size": "xs",
                                 "color": "#ffffffbb", "margin": "xs"},
                            ],
                        },
                        {"type": "text", "text": stage_emoji,
                         "size": "3xl", "flex": 0},
                    ],
                },
                header_progress,
            ],
        },
        "body": {
            "type": "box", "layout": "vertical",
            "paddingAll": "12px", "spacing": "sm",
            "contents": body_contents,
        },
        "footer": {
            "type": "box", "layout": "horizontal",
            "spacing": "sm", "paddingAll": "10px",
            "contents": footer_contents,
        },
    }


def build_ricefit_bubble(farm: dict, ricefit_data: dict, check_type: str) -> dict:
    """Ricefit result bubble. check_type: 'soil' | 'risk'."""
    farm_name    = farm.get("farm_name") or "ไม่ระบุชื่อ"
    rice_variety = farm.get("rice_variety") or "ไม่ระบุ"

    risk_data     = (ricefit_data.get("ระดับความเสี่ยง") or [{}])[0]
    soil_data     = (ricefit_data.get("ข้อมูลดิน") or [{}])[0]
    top_varieties = (ricefit_data.get("พันธุ์ข้าวแนะนํา") or [])[:3]

    def risk_row(factor: str, level: float) -> dict:
        lvl = round(level)
        if lvl <= 1:
            emoji, text, color = "🟢", "ไม่เสี่ยง",        "#2e7d32"
        elif lvl == 2:
            emoji, text, color = "🟡", "เสี่ยงน้อย",       "#f9a825"
        elif lvl == 3:
            emoji, text, color = "🟠", "เสี่ยงปานกลาง",   "#e65100"
        elif lvl == 4:
            emoji, text, color = "🔴", "เสี่ยงมาก",        "#c62828"
        else:
            emoji, text, color = "🔴", "เสี่ยงมากที่สุด", "#b71c1c"
        return {
            "type": "box", "layout": "horizontal", "spacing": "sm",
            "contents": [
                {"type": "text", "text": emoji, "size": "sm", "flex": 0},
                {"type": "text", "text": factor, "size": "sm", "color": "#555555", "flex": 1},
                {"type": "text", "text": text, "size": "xs", "color": color, "flex": 0, "align": "end"},
            ],
        }

    if check_type == "soil":
        header_color = "#5d4037"
        body: list = [
            {"type": "text", "text": "🌱 สภาพดิน",
             "weight": "bold", "size": "sm", "color": "#333333"},
        ]
        if soil_data:
            for key in [
                "คำอธิบายเนื้อดิน",
                "อินทรียวัตถุ",
                "ปฏิกิริยาดิน",
                "ปริมาณฟอสฟอรัส",
                "ปริมาณโพแทสเซียม",
                "ความจุแคตไอออน ",
                "ค่าการนำไฟฟ้าของดิน",
            ]:
                body.append({
                    "type": "box", "layout": "horizontal", "spacing": "sm",
                    "contents": [
                        {"type": "text", "text": key.strip(),
                         "size": "xs", "color": "#888888", "flex": 1},
                        {"type": "text", "text": str(soil_data.get(key, "-")),
                         "size": "xs", "color": "#555555", "flex": 0, "align": "end"},
                    ],
                })
        else:
            body.append({
                "type": "text", "text": "ไม่พบข้อมูลดิน",
                "size": "xs", "color": "#888888",
            })

    else:
        max_risk = max((float(risk_data.get(k, 0)) for k in RISK_KEYS if k in risk_data), default=0)
        header_color = (
            "#b71c1c" if max_risk >= 5 else
            "#c62828" if max_risk >= 4 else
            "#e65100" if max_risk >= 3 else
            "#f9a825" if max_risk >= 2 else
            "#2e7d32"
        )
        body = [
            {"type": "text", "text": "⚠️ ความเสี่ยง",
             "weight": "bold", "size": "sm", "color": "#333333"},
        ]
        for k in RISK_KEYS:
            if k in risk_data:
                body.append(risk_row(k, float(risk_data[k])))
        if top_varieties:
            body += [
                {"type": "separator", "margin": "sm", "color": "#eeeeee"},
                {"type": "text", "text": "🌾 พันธุ์แนะนำสำหรับพื้นที่นี้",
                 "weight": "bold", "size": "sm", "color": "#333333", "margin": "sm"},
            ]
            for i, v in enumerate(top_varieties, 1):
                body.append({
                    "type": "text",
                    "text": f"{i}. {v.get('rice_variety', '-')}  ({v.get('sensitivity', '')})",
                    "size": "xs", "color": "#555555",
                })

    return {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": header_color, "paddingAll": "12px",
            "contents": [
                {"type": "text", "text": farm_name,
                 "color": "#ffffff", "weight": "bold", "size": "md", "wrap": True},
                {"type": "text", "text": f"🌾 {rice_variety}",
                 "color": "#cccccc", "size": "xs"},
            ],
        },
        "body": {
            "type": "box", "layout": "vertical",
            "paddingAll": "12px", "spacing": "xs",
            "contents": body,
        },
    }


# ─── Monthly risk matrix ─────────────────────────────────────────────────────────

# Short labels: tighter for 8-column display
_RISK_SHORT = {
    "ดินเปรี้ยว":    "เปรี้ยว",
    "ดินเค็ม":       "เค็ม",
    "แล้ง":           "แล้ง",
    "น้ำท่วมฉับพลัน": "ท่วม",
    "โรคขอบใบแห้ง":  "ขอบใบ",
    "โรคใบไหม้":     "ไหม้",
    "ระยะข้าว":      "ระยะ",
    "อุณหภูมิสูง":   "ร้อน",
    "อุณหภูมิต่ำ":   "หนาว",
}


def _month_stage_emoji(month_idx: int, sensitivity: str) -> str:
    thresholds = [30, 90, 150, 200, 240] if sensitivity == "ไวแสง" else [15, 45, 75, 105, 120]
    midday = month_idx * 30 + 15
    for i, t in enumerate(thresholds):
        if midday <= t:
            return STAGE_META[i]["emoji"]
    return STAGE_META[-1]["emoji"]


def _risk_dot(level: int) -> str:
    if level >= 4: return "🔴"
    if level == 3: return "🟠"
    if level == 2: return "🟡"
    return "🟢"


def build_monthly_risk_matrix(farm: dict, monthly_data: list) -> dict:
    """
    Matrix bubble: rows = risk factors, columns = months (4 or 8).
    monthly_data: list of ricefit API responses, one per month.
    Returns a bubble dict.
    """
    sensitivity   = farm.get("sensitivity") or "ไม่ไวแสง"
    farm_name     = farm.get("farm_name") or "ไม่ระบุชื่อ"
    rice_variety  = farm.get("rice_variety") or "ไม่ระบุ"
    planting_date = farm.get("planting_date") or date.today().strftime("%Y-%m-%d")

    try:
        start_dt = datetime.strptime(planting_date, "%Y-%m-%d")
    except Exception:
        start_dt = datetime.today()

    n         = len(monthly_data)
    risk_rows = [(d.get("ระดับความเสี่ยง") or [{}])[0] for d in monthly_data]
    varieties = (monthly_data[0].get("พันธุ์ข้าวแนะนํา") or [])[:3] if monthly_data else []
    labels    = [_THAI_MONTHS[(start_dt.month - 1 + i) % 12] for i in range(n)]
    stage_emojis = [_month_stage_emoji(i, sensitivity) for i in range(n)]

    label_flex = 2

    # ── Header row ────────────────────────────────────────────────────────────────
    header_row = [{"type": "text", "text": " ", "flex": label_flex, "size": "xxs"}]
    for emoji, label in zip(stage_emojis, labels):
        header_row.append({
            "type": "box", "layout": "vertical", "flex": 1, "alignItems": "center",
            "contents": [
                {"type": "text", "text": emoji, "size": "xs", "align": "center"},
                {"type": "text", "text": label, "size": "xxs", "color": "#aaaaaa", "align": "center"},
            ],
        })

    body: list = [
        {"type": "box", "layout": "horizontal", "contents": header_row},
        {"type": "separator", "margin": "sm", "color": "#eeeeee"},
    ]

    # ── Factor rows (only factors with at least one month ≥ 2) ───────────────────
    worst_overall = 0
    has_risk = False
    for key in RISK_KEYS:
        levels    = [round(float(rd.get(key, 0))) for rd in risk_rows]
        max_level = max(levels)
        if max_level < 2:
            continue
        has_risk = True
        worst_overall = max(worst_overall, max_level)
        row = [{"type": "text", "text": _RISK_SHORT.get(key, key),
                "flex": label_flex, "size": "xxs", "color": "#555555"}]
        for lvl in levels:
            row.append({"type": "text", "text": _risk_dot(lvl),
                        "flex": 1, "align": "center", "size": "xs"})
        body.append({"type": "box", "layout": "horizontal",
                     "margin": "xs", "contents": row})

    if not has_risk:
        body.append({"type": "text", "text": "✅ ไม่พบความเสี่ยงตลอด crop period",
                     "size": "xs", "color": "#2e7d32", "margin": "sm"})

    # ── Risk summary ──────────────────────────────────────────────────────────────
    body.append({"type": "separator", "margin": "sm", "color": "#eeeeee"})
    if has_risk:
        risky_summary = sorted(
            [(k, max(round(float(rd.get(k, 0))) for rd in risk_rows))
             for k in RISK_KEYS
             if max(round(float(rd.get(k, 0))) for rd in risk_rows) >= 2],
            key=lambda x: -x[1],
        )
        summary_parts = [f"{_RISK_SHORT.get(k, k)} {_risk_dot(lvl)}" for k, lvl in risky_summary]
        body.append({
            "type": "text",
            "text": "⚠️ ต้องระวัง: " + "  •  ".join(summary_parts),
            "size": "xxs", "color": "#c62828", "wrap": True, "margin": "sm",
        })
    else:
        body.append({
            "type": "text", "text": "✅ ปลอดภัยตลอดฤดูกาล",
            "size": "xxs", "color": "#2e7d32", "margin": "sm",
        })

    # ── Recommended varieties ─────────────────────────────────────────────────────
    if varieties:
        body.append({"type": "separator", "margin": "md", "color": "#eeeeee"})
        body.append({
            "type": "text", "text": "🌾 พันธุ์แนะนำสำหรับพื้นที่นี้",
            "weight": "bold", "size": "xs", "color": "#333333", "margin": "md",
        })
        for i, v in enumerate(varieties, 1):
            body.append({
                "type": "text",
                "text": f"{i}. {v.get('rice_variety', '-')}  ({v.get('sensitivity', '')})",
                "size": "xs", "color": "#555555",
            })

    header_color = (
        "#b71c1c" if worst_overall >= 5 else
        "#c62828" if worst_overall >= 4 else
        "#e65100" if worst_overall >= 3 else
        "#f9a825" if worst_overall >= 2 else
        "#2e7d32"
    )

    return {
        "type": "bubble", "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": header_color, "paddingAll": "12px",
            "contents": [
                {"type": "text", "text": farm_name,
                 "color": "#ffffff", "weight": "bold", "size": "sm", "wrap": True},
                {"type": "text", "text": f"🌾 {rice_variety}  ·  ความเสี่ยงราย {n} เดือน",
                 "color": "#cccccc", "size": "xs"},
            ],
        },
        "body": {
            "type": "box", "layout": "vertical",
            "paddingAll": "12px", "spacing": "none",
            "contents": body,
        },
    }
