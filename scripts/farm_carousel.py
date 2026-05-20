"""
farm_carousel.py
สร้าง LINE Flex Message Carousel สำหรับแสดงรายการแปลงนาของ user

modes:
  (default)         แสดง overview ของแปลงทั้งหมด
  --select-soil     carousel เลือกแปลงสำหรับตรวจสอบข้อมูลดิน
  --select-risk     carousel เลือกแปลงสำหรับประเมินความเสี่ยง
  --send            ส่งจริงผ่าน LINE Messaging API
"""

import os
import sys
import json
import requests
from datetime import datetime, date

from messages import LIFF_URL, build_farm_bubble, build_ricefit_bubble

# ─── Config ────────────────────────────────────────────────────────────────────
NECTEC_BASE_URL = os.getenv(
    "NEXT_PUBLIC_API_BASE_URL",
    "https://www.nectec.or.th/innovation/innovation-service/digital-agri-api",
)
NECTEC_API_KEY            = os.getenv("NECTEC_API_KEY", "")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_PUSH_URL             = "https://api.line.me/v2/bot/message/push"

ALL_FACTORS = [
    "ดินเปรี้ยว", "ดินเค็ม", "แล้ง", "น้ำท่วมฉับพลัน",
    "โรคขอบใบแห้ง", "โรคใบไหม้", "ระยะข้าว", "อุณหภูมิสูง", "อุณหภูมิต่ำ",
]


# ─── Data fetching ──────────────────────────────────────────────────────────────

def get_farms(user_id: str) -> list:
    url = f"{NECTEC_BASE_URL}/farm/{user_id}"
    res = requests.get(url, headers={"accept": "application/json"}, timeout=10)
    res.raise_for_status()
    data = res.json()
    if isinstance(data, list):
        return data
    return data.get("result", data.get("farms", data.get("data", [])))


def fetch_ricefit(farm: dict) -> dict:
    lat           = farm.get("latitude")
    lon           = farm.get("longitude")
    rice_variety  = farm.get("rice_variety") or "กข51"
    sensitivity   = farm.get("sensitivity") or "ไม่ไวแสง"
    planting_date = farm.get("planting_date") or date.today().strftime("%Y-%m-%d")

    try:
        month = datetime.strptime(planting_date, "%Y-%m-%d").month
    except Exception:
        month = date.today().month

    params = [
        ("lat",          lat),
        ("lon",          lon),
        ("rice_variety", rice_variety),
        ("sensitivity",  sensitivity),
        ("month",        month),
        ("start_date",   planting_date),
    ] + [("factors", f) for f in ALL_FACTORS]

    res = requests.get(
        f"{NECTEC_BASE_URL}/ricefit",
        headers={"accept": "application/json", "apikey": NECTEC_API_KEY},
        params=params,
        timeout=15,
    )
    if not res.ok:
        raise ValueError(f"ricefit error {res.status_code}: {res.text[:300]}")
    return res.json()


# ─── Composite message builders ─────────────────────────────────────────────────

def build_carousel_message(user_id: str) -> dict:
    farms = get_farms(user_id)
    if not farms:
        return {"type": "text",
                "text": "ยังไม่มีแปลงนา กดลิงก์เพื่อเพิ่มแปลงแรกได้เลยครับ 👇\n" + LIFF_URL}
    return {
        "type": "flex",
        "altText": f"แปลงนาของคุณ {len(farms)} แปลง",
        "contents": {"type": "carousel",
                     "contents": [build_farm_bubble(f) for f in farms[:12]]},
    }


def build_select_message(user_id: str, check_type: str) -> list:
    """check_type: 'soil' | 'risk'"""
    farms = get_farms(user_id)
    label = "ข้อมูลสภาพดินและน้ำ" if check_type == "soil" else "ความเสี่ยงโรคและแมลง"
    if not farms:
        return [{"type": "text",
                 "text": "ยังไม่มีแปลงนา กดลิงก์เพื่อเพิ่มแปลงแรกได้เลยครับ 👇\n" + LIFF_URL}]
    return [
        {"type": "text", "text": f"📋 เลือกแปลงที่ต้องการดู{label} ได้เลยครับ 👇"},
        {
            "type": "flex",
            "altText": f"เลือกแปลงสำหรับ{label}",
            "contents": {
                "type": "carousel",
                "contents": [build_farm_bubble(f, select_mode=check_type) for f in farms[:12]],
            },
        },
    ]


def build_check_result_messages(user_id: str, farm_index: int, check_type: str) -> list:
    farms = get_farms(user_id)
    if not farms:
        return [{"type": "text", "text": "ไม่พบข้อมูลแปลงนาครับ"}]

    farm      = farms[min(farm_index, len(farms) - 1)]
    farm_name = farm.get("farm_name") or "ไม่ระบุชื่อ"
    label     = "สภาพดิน" if check_type == "soil" else "ความเสี่ยง"

    print(f"[INFO] กำลังดึง ricefit สำหรับ '{farm_name}'...")
    ricefit_data  = fetch_ricefit(farm)
    result_bubble = build_ricefit_bubble(farm, ricefit_data, check_type)
    return [
        {"type": "text", "text": f"📊 ผล{label}ของแปลง \"{farm_name}\" ครับ"},
        {"type": "flex", "altText": f"ผล{label} {farm_name}", "contents": result_bubble},
    ]


# ─── LINE send ──────────────────────────────────────────────────────────────────

def send_to_line(line_user_id: str, messages: list) -> dict:
    if not LINE_CHANNEL_ACCESS_TOKEN:
        raise ValueError("กรุณาตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน environment variable")
    res = requests.post(
        LINE_PUSH_URL,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}"},
        json={"to": line_user_id, "messages": messages},
        timeout=10,
    )
    if not res.ok:
        raise ValueError(f"LINE API error {res.status_code}: {res.text}")
    return res.json()


# ─── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args     = sys.argv[1:]
    user_id  = next((a for a in args if not a.startswith("--")), "mock_user_123")
    send_msg = "--send" in args

    farm_idx = 0
    if "--farm" in args:
        fi = args.index("--farm")
        if fi + 1 < len(args):
            farm_idx = int(args[fi + 1])

    if "--check-soil" in args:
        mode = "check-soil"
    elif "--check-risk" in args:
        mode = "check-risk"
    elif "--select-soil" in args:
        mode = "select-soil"
    elif "--select-risk" in args:
        mode = "select-risk"
    else:
        mode = "overview"

    print(f"[INFO] user: {user_id}  mode: {mode}  farm_idx: {farm_idx}")

    if mode == "check-soil":
        messages = build_check_result_messages(user_id, farm_idx, "soil")
    elif mode == "check-risk":
        messages = build_check_result_messages(user_id, farm_idx, "risk")
    elif mode == "select-soil":
        messages = build_select_message(user_id, "soil")
    elif mode == "select-risk":
        messages = build_select_message(user_id, "risk")
    else:
        messages = [build_carousel_message(user_id)]

    if send_msg:
        print("[INFO] กำลังส่งผ่าน LINE...")
        result = send_to_line(user_id, messages)
        print("[OK] ส่งสำเร็จ:", result)
    else:
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        print("\n[TIP] commands:")
        print(f"  python farm_carousel.py {user_id} --send                          # overview")
        print(f"  python farm_carousel.py {user_id} --select-soil --send            # เลือกแปลง (ดิน)")
        print(f"  python farm_carousel.py {user_id} --select-risk --send            # เลือกแปลง (ความเสี่ยง)")
        print(f"  python farm_carousel.py {user_id} --check-soil --farm 2 --send    # ผลดิน แปลงที่ 3")
        print(f"  python farm_carousel.py {user_id} --check-risk --farm 2 --send    # ผลความเสี่ยง แปลงที่ 3")
