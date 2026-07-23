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

from notify_disease_forecast import (
    fetch_forecast, analyze_risk,
    analyze_growth_risk, build_combined_alert_messages,
)
from farm_carousel import get_farms, send_to_line
from weather_utils import get_forecast_risk_records
from messages import _growth_stage

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

def _collect_alert_farms(user_id: str):
    """ดึงแปลงและเช็คความเสี่ยงทั้งโรค (NECTEC) และอุณหภูมิ (weather_utils ในเครื่อง)
    คืน (disease_alerts, growth_alerts) หรือ (None, None) ถ้า get_farms ล้มเหลว"""
    try:
        farms = get_farms(user_id)
    except Exception as e:
        print(f"[WARN] {user_id}: get_farms ล้มเหลว — {e}")
        return None, None

    notifiable = [f for f in farms if f.get("notification_diseases")]
    if not notifiable:
        print(f"[SKIP] {user_id}: ไม่มีแปลงที่เปิด notification")
        return [], []

    disease_alerts = []
    growth_alerts  = []

    for farm in notifiable:
        farm_name  = farm.get("farm_name") or "ไม่ระบุชื่อ"
        subscribed = farm.get("notification_diseases", [])

        # ── ความเสี่ยงโรค (NECTEC /ricefit_forecast) ──
        try:
            records = fetch_forecast(farm)
            risk    = _filter_risk(analyze_risk(records, min_cnt=5) or {}, subscribed)
        except Exception as e:
            print(f"  [WARN] {farm_name}: disease check ล้มเหลว — {e}")
            risk = {}

        if risk:
            print(f"  [ALERT] {farm_name}: {', '.join(v['label'] for v in risk.values())}")
            disease_alerts.append((farm, risk, records))
        else:
            print(f"  [OK]    {farm_name}: ปลอดภัย (โรค)")

        # ── ความเสี่ยงอุณหภูมิ/ระยะการเจริญเติบโต (Open-Meteo ผ่าน weather_utils) ──
        if "temperature" not in subscribed:
            continue
        lat, lon = farm.get("latitude"), farm.get("longitude")
        if not lat or not lon:
            continue
        try:
            growth_records = get_forecast_risk_records(lat, lon)
            stage_idx, _, _ = _growth_stage(farm.get("planting_date") or "", farm.get("sensitivity") or "ไม่ไวแสง")
            growth_risk = analyze_growth_risk(growth_records, stage_idx)
        except Exception as e:
            print(f"  [WARN] {farm_name}: temperature check ล้มเหลว — {e}")
            continue

        if growth_risk:
            print(f"  [ALERT] {farm_name}: {', '.join(v['label'] for v in growth_risk.values())}")
            growth_alerts.append((farm, growth_risk, growth_records))
        else:
            print(f"  [OK]    {farm_name}: ปลอดภัย (อุณหภูมิ)")

    return disease_alerts, growth_alerts


def _notify_user(user_id: str, dry_run: bool) -> None:
    disease_alerts, growth_alerts = _collect_alert_farms(user_id)
    if disease_alerts is None:
        return

    if not disease_alerts and not growth_alerts:
        print(f"[INFO] {user_id}: ทุกแปลงปลอดภัย — ไม่ส่ง notification")
        if not dry_run:
            log_notification(user_id, "no_risk")
        return

    messages = build_combined_alert_messages(disease_alerts, growth_alerts)
    summary  = f"โรค {len(disease_alerts)} แปลง / อุณหภูมิ {len(growth_alerts)} แปลง"

    if dry_run:
        print(f"[DRY-RUN] {user_id}: จะส่ง {summary}")
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        return

    try:
        send_to_line(user_id, messages)
        log_notification(user_id, "success")
        print(f"[SENT] {user_id}: ส่งแจ้งเตือน {summary} สำเร็จ")
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
