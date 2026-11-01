#!/usr/bin/env python3
"""Nurush-un fəaliyyət hesabatı (Bakı vaxtı ilə).
İstifadə: python3 tools/report.py [otaq] [layihə]
Giriş: gcloud auth application-default login (layihənin sahibi kimi)."""
import json, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone

ROOM = sys.argv[1] if len(sys.argv) > 1 else "otaq-de53c40b"
PROJECT = sys.argv[2] if len(sys.argv) > 2 else "elnur-chat-51526d"
BAKU = timezone(timedelta(hours=4))
TOKEN = subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], text=True).strip()
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/rooms/{ROOM}"

def val(v):
    for k, x in v.items():
        if k == "integerValue": return int(x)
        if k == "doubleValue": return float(x)
        if k == "timestampValue": return int(datetime.fromisoformat(x.replace("Z", "+00:00")).timestamp() * 1000)
        if k == "nullValue": return None
        return x

def docs(col):
    out, page = [], ""
    while True:
        req = urllib.request.Request(f"{BASE}/{col}?pageSize=300" + (f"&pageToken={page}" if page else ""),
                                     headers={"Authorization": f"Bearer {TOKEN}", "x-goog-user-project": PROJECT})
        d = json.load(urllib.request.urlopen(req))
        for x in d.get("documents", []):
            f = {k: val(v) for k, v in x.get("fields", {}).items() if k != "data"}
            f["_id"] = x["name"].rsplit("/", 1)[1]
            out.append(f)
        page = d.get("nextPageToken")
        if not page: return out

t = lambda ms: datetime.fromtimestamp(ms / 1000, BAKU).strftime("%d.%m %H:%M")
dur = lambda ms: f"{round(ms/60000)} dəq" if ms < 3600000 else f"{int(ms//3600000)} saat {round(ms%3600000/60000)} dəq"
now = int(datetime.now().timestamp() * 1000)

visits = sorted([v for v in docs("visits") if v.get("uid") == "nurush"], key=lambda v: v["at"])
pres = {p["_id"]: p for p in docs("presence")}
msgs = sorted(docs("messages"), key=lambda m: m.get("ts", 0))
roles = {r["_id"]: r for r in docs("meta")}.get("roles", {})

p = pres.get("nurush")
online = bool(p and p.get("online") and now - p.get("at", 0) < 70000)

raw, open_by = [], {}
for v in visits:
    k = v.get("dev", "x")
    if v["type"] == "in":
        if open_by.get(k) and not open_by[k]["end"]: open_by[k]["end"] = v["at"]
        open_by[k] = {"start": v["at"], "end": None}; raw.append(open_by[k])
    elif open_by.get(k) and not open_by[k]["end"]:
        open_by[k]["end"] = v["at"]
last_start = max([x["start"] for x in raw], default=0)
for x in raw:
    if not x["end"]: x["end"] = now if (online and x["start"] == last_start) else min(x["start"] + 3600000, now)
sessions = []
for x in sorted(raw, key=lambda x: x["start"]):
    if sessions and x["start"] <= sessions[-1]["end"]: sessions[-1]["end"] = max(sessions[-1]["end"], x["end"])
    else: sessions.append(dict(x))

mine = [m for m in msgs if m.get("uid") == "elish"]
hers = [m for m in msgs if m.get("uid") == "nurush"]
reads = sorted(m["readAt"] for m in mine if m.get("readAt"))
for s in sessions: s["reads"] = 0
for r in reads:
    for s in sessions:
        if s["start"] - 5000 <= r <= s["end"] + 5000: s["reads"] += 1; break

print(f"Rollar: Elish={'✓' if 'elish' in roles else '—'}  Nurush={'✓ (' + t(roles['nurush']) + ')' if 'nurush' in roles else 'hələ girməyib'}")
print("İndi:", "🟢 onlayn" if online else (f"⚪ son görülmə {t(p['at'])}" if p else "⚪ heç girməyib"))
day0 = int(datetime.now(BAKU).replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
for title, frm in [("Bu gün", day0), ("Son 7 gün", now - 7 * 86400000), ("Ümumi", 0)]:
    ss = [s for s in sessions if s["start"] >= frm]
    print(f"{title}: {len(ss)} dəfə girib, {dur(sum(s['end']-s['start'] for s in ss))}, {sum(s['reads'] for s in ss)} mesaj oxuyub")
print(f"Elish-in mesajları: {len(mine)}, oxunub {len(reads)}, oxunmayıb {len(mine)-len(reads)}" + (f", son oxuma {t(reads[-1])}" if reads else ""))
print(f"Nurush-un yazdığı mesajlar: {len(hers)}" + (f", sonuncu {t(hers[-1]['ts'])}" if hers else ""))
print("\nGirişlər (son 30):")
for s in sessions[-30:]:
    print(f"  {t(s['start'])} – {t(s['end'])[6:]}  ({dur(s['end']-s['start'])})" + (f"  · {s['reads']} mesaj oxudu" if s['reads'] else ""))
