import json, os
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
LOCAL_STORE = Path("data/telemetry.jsonl")
LOCAL_STORE.parent.mkdir(exist_ok=True)

def save_local(payload):
    with LOCAL_STORE.open("a") as f:
        f.write(json.dumps(payload) + "\n")

def recent_local(limit=100):
    if not LOCAL_STORE.exists():
        return []
    lines = LOCAL_STORE.read_text().splitlines()[-limit:]
    return [json.loads(x) for x in reversed(lines)]

def reliability():
    records = recent_local(10000)
    if not records:
        return {"expected":0,"processed":0,"reliability_pct":100.0}
    processed = sum(bool(r.get("processed", True)) for r in records)
    return {
        "expected": len(records),
        "processed": processed,
        "reliability_pct": round(processed / len(records) * 100, 2)
    }
