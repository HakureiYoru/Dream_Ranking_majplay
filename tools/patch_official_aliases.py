#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One-shot: merge yuzuchan aliases into official_catalog.json."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "web" / "data"
TMP = DATA / "_alias_tmp.json"
ALIAS = DATA / "music_alias.json"
CATALOG = DATA / "official_catalog.json"


def main() -> None:
    if TMP.exists():
        shutil.copyfile(TMP, ALIAS)
        TMP.unlink(missing_ok=True)
    rows = json.loads(ALIAS.read_text(encoding="utf-8"))
    amap: dict[int, list[str]] = {}
    for row in rows:
        try:
            sid = int(row["song_id"])
        except (KeyError, TypeError, ValueError):
            continue
        aliases = [str(a).strip() for a in (row.get("alias") or []) if str(a).strip()]
        if aliases:
            amap[sid] = aliases

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    hit = 0
    for song in cat.get("songs") or []:
        try:
            n = int(song["id"])
        except (KeyError, TypeError, ValueError):
            song["aliases"] = []
            continue
        aliases = amap.get(n) or amap.get(n % 10000) or []
        song["aliases"] = aliases
        if aliases:
            hit += 1

    CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    sample = (cat.get("songs") or [{}])[0]
    print(f"patched aliases: {hit}/{len(cat.get('songs') or [])}")
    print("sample", sample.get("title"), sample.get("version"), (sample.get("aliases") or [])[:5])


if __name__ == "__main__":
    main()
