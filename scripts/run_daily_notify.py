"""
run_daily_notify.py
Cronjob script: ส่ง LINE notification ความเสี่ยงโรคข้าวรายวัน

รัน: python -m scripts.run_daily_notify [--dry-run]
  --dry-run   แสดงผลโดยไม่ส่งจริง

Cooldown: จัดการโดย backend ผ่าน POST /notifications/log
"""

import os, sys, json
from datetime import date
from pathlib import Path

import requests as _requests

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env.local")
load_dotenv(dotenv_path=Path("/storage/teera/innovation/innovation-service/ricefit-m/chatbot/v2/bot/.env"))

from notify_disease_forecast import fetch_forecast, analyze_risk, build_alert_messages
from farm_carousel import get_farms, send_to_line

NECTEC_BASE_URL = os.getenv("NEXT_PUBLIC_API_BASE_URL", "")
NECTEC_API_KEY  = os.getenv("NECTEC_API_KEY", "")

DISEASE_KEY_MAP = {
    "blast":  "cnt_blast_disease",
    "blight": "cnt_blb_disease",
}

_HEADERS = {"accept": "application/json", "apikey": NECTEC_API_KEY}


# ─── API calls ───────────────────────────────────────────────────────────────────

def get_notifiable_users() -> list[str]:
    """GET /notifications/users/to-notify → list of user_id"""
    res = _requests.get(
        f"{NECTEC_BASE_URL}/notifications/users/to-notify",
        headers=_HEADERS,
        timeout=15,
        verify=False,
    )
    res.raise_for_status()
    data = res.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    if not items:
        return []
    if isinstance(items[0], str):
        return items
    seen, result = set(), []
    for item in items:
        uid = item.get("user_id", "")
        if uid and uid not in seen:
            seen.add(uid)
            result.append(uid)
    return result


def log_notification(user_id: str, status: str) -> None:
    """POST /notifications/log — บันทึก log เพื่อ cooldown"""
    try:
        res = _requests.post(
            f"{NECTEC_BASE_URL}/notifications/log",
            headers={**_HEADERS, "Content-Type": "application/json"},
            json={"user_id": user_id, "status": status},
            timeout=10,
        )
        print(f"  [LOG] {status} -> {res.status_code} {res.text[:200]}")
        res.raise_for_status()
    except Exception as e:
        print(f"  [WARN] log_notification ล้มเหลว: {e}")


# ─── Risk filter ────────────────────────────────────────────────────────────────

def _filter_risk(risk: dict, subscribed: list[str]) -> dict:
    allowed = {DISEASE_KEY_MAP[d] for d in subscribed if d in DISEASE_KEY_MAP}
    return {k: v for k, v in risk.items() if k in allowed}


# ─── Per-user logic ─────────────────────────────────────────────────────────────

def _collect_alert_farms(user_id: str) -> list | None:
    """ดึงแปลงและเช็คความเสี่ยง — คืน None ถ้า get_farms ล้มเหลว"""
    try:
        farms = get_farms(user_id)
    except Exception as e:
        print(f"[WARN] {user_id}: get_farms ล้มเหลว — {e}")
        return None

    notifiable = [f for f in farms if f.get("notification_diseases")]
    if not notifiable:
        print(f"[SKIP] {user_id}: ไม่มีแปลงที่เปิด notification")
        return []

    alert_farms = []
    for farm in notifiable:
        farm_name  = farm.get("farm_name") or "ไม่ระบุชื่อ"
        subscribed = farm.get("notification_diseases", [])
        try:
            records = fetch_forecast(farm)
            risk    = analyze_risk(records, min_cnt=5)
        except Exception as e:
            print(f"  [WARN] {farm_name}: {e}")
            continue

        if not risk:
            print(f"  [OK]    {farm_name}: ปลอดภัย")
            continue

        risk = _filter_risk(risk, subscribed)
        if not risk:
            print(f"  [OK]    {farm_name}: มีความเสี่ยงแต่ไม่ตรงโรคที่ subscribe")
            continue

        print(f"  [ALERT] {farm_name}: {', '.join(v['label'] for v in risk.values())}")
        alert_farms.append((farm, risk, records))

    return alert_farms


def _notify_user(user_id: str, dry_run: bool) -> None:
    alert_farms = _collect_alert_farms(user_id)
    if alert_farms is None:
        return

    if not alert_farms:
        print(f"[INFO] {user_id}: ทุกแปลงปลอดภัย — ไม่ส่ง notification")
        if not dry_run:
            log_notification(user_id, "no_risk")
        return

    messages = build_alert_messages(alert_farms)

    if dry_run:
        print(f"[DRY-RUN] {user_id}: จะส่ง {len(alert_farms)} แปลง")
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        return

    try:
        send_to_line(user_id, messages)
        log_notification(user_id, "success")
        print(f"[SENT] {user_id}: ส่งแจ้งเตือน {len(alert_farms)} แปลงสำเร็จ")
    except Exception as e:
        log_notification(user_id, "failed")
        print(f"[ERROR] {user_id}: ส่งไม่สำเร็จ — {e}")


# ─── Main ───────────────────────────────────────────────────────────────────────

def run(dry_run: bool = False, user_ids: list[str] | None = None) -> None:
    print(f"[INFO] วันที่: {date.today().isoformat()}  dry_run={dry_run}\n")

    if user_ids is None:
        try:
            user_ids = get_notifiable_users()
        except Exception as e:
            print(f"[ERROR] get_notifiable_users: {e}")
            sys.exit(1)

    print(f"[INFO] พบ {len(user_ids)} user ที่ต้องแจ้งเตือน\n")

    for user_id in user_ids:
        _notify_user(user_id, dry_run)
        print()
        print()


if __name__ == "__main__":
    args    = sys.argv[1:]
    dry_run = "--dry-run" in args

    # --user <id>  bypass API ใช้สำหรับ test เฉพาะ user
    if "--user" in args:
        idx      = args.index("--user")
        specific = [args[idx + 1]]
        run(dry_run=dry_run, user_ids=specific)
    else:
        run(dry_run=dry_run)
