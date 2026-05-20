"""
test_ricefit.py
ทดสอบ LINE message ที่ build จากข้อมูล ricefit

Usage:
  python scripts/test_ricefit.py <user_id> [--farm N] [--type soil|risk] [--send]

Example:
  python scripts/test_ricefit.py U2956ca5c8cfd8282d6b63f9675597b3c --type soil
  python scripts/test_ricefit.py U2956ca5c8cfd8282d6b63f9675597b3c --type risk --send
"""

import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from farm_carousel import build_check_result_messages, send_to_line

if __name__ == "__main__":
    args      = sys.argv[1:]
    user_id   = next((a for a in args if not a.startswith("--")), "mock_user_123")
    send_msg  = "--send" in args
    check_type = "risk" if "--type" in args and args[args.index("--type") + 1] == "risk" else "soil"

    farm_idx = 0
    if "--farm" in args:
        fi = args.index("--farm")
        if fi + 1 < len(args):
            farm_idx = int(args[fi + 1])

    print(f"[INFO] user={user_id}  farm_idx={farm_idx}  type={check_type}\n")

    messages = build_check_result_messages(user_id, farm_idx, check_type)

    if send_msg:
        print("[INFO] กำลังส่งผ่าน LINE...")
        result = send_to_line(user_id, messages)
        print("[OK]", result)
    else:
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        print(f"\n[TIP] เพิ่ม --send เพื่อส่งจริง")
