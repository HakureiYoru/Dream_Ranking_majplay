#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync official maimai charts from Diving-Fish music_data + multi-source covers."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DATA_DIR = WEB / "data"
COVER_DIR = WEB / "assets" / "official-covers"
CATALOG_PATH = DATA_DIR / "official_catalog.json"
MUSIC_CACHE = DATA_DIR / "diving_fish_music_data.json"

MUSIC_DATA_URL = "https://www.diving-fish.com/api/maimaidxprober/music_data"
# 柚子别名库（maimaiDX / YuzuChaN）：https://github.com/Yuri-YuzuChaN/maimaiDX
ALIAS_URL = "https://www.yuzuchan.moe/api/v2/aliases/maimaidx/aliases"
# 封面：水鱼 + 落雪；DX 新曲常用完整 id，老曲/翻新常用 id%10000
COVER_URL_TEMPLATES = (
    "https://www.diving-fish.com/covers/{key}.png",
    "https://assets2.lxns.net/maimai/jacket/{key}.png",
)
USER_AGENT = "DreamRankingMajplayOfficialGuessSync/1.1"
DEFAULT_CONCURRENCY = 16
ALIAS_CACHE = DATA_DIR / "music_alias.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def log(msg: str) -> None:
    print(msg, flush=True)


def curl_available() -> bool:
    return shutil.which("curl") is not None or shutil.which("curl.exe") is not None


def curl_bin() -> str:
    return shutil.which("curl.exe") or shutil.which("curl") or "curl"


def download_to_file(url: str, dest: Path, timeout: float = 90.0) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Prefer curl on Windows: urllib often hits SSL EOF against diving-fish
    if curl_available():
        cmd = [
            curl_bin(),
            "-fsSL",
            "--connect-timeout",
            "20",
            "--max-time",
            str(int(timeout)),
            "-A",
            USER_AGENT,
            "-o",
            str(dest),
            url,
        ]
        subprocess.run(cmd, check=True, stderr=subprocess.DEVNULL)
        if not dest.exists() or dest.stat().st_size <= 0:
            raise RuntimeError(f"curl empty download: {url}")
        return

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        dest.write_bytes(resp.read())


def parse_song_id(song_id: str | int) -> int:
    try:
        return int(str(song_id).strip())
    except ValueError:
        return 0


def cover_key_candidates(song_id: str | int) -> list[str]:
    """按曲目类型优先尝试更可能命中的 jacket key。"""
    n = parse_song_id(song_id)
    base = n % 10000
    if n < 10000:
        # 标准 SD
        ordered = [f"{n:05d}", str(n), f"{base:05d}", str(base)]
    elif n < 11000:
        # 10000–10999：旧曲 DX 翻新，jacket 与 SD 共用 base id
        ordered = [str(base), f"{base:05d}", str(n), f"{n:05d}"]
    else:
        # 11000+ DX 新曲 / 宴会等：水鱼常用完整 id（covers/11001.png）
        ordered = [str(n), str(base), f"{base:05d}", f"{n:05d}"]
    seen: set[str] = set()
    out: list[str] = []
    for key in ordered:
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def local_cover_paths(song_id: str | int) -> list[Path]:
    n = parse_song_id(song_id)
    names = [f"{n}.png", f"{n:05d}.png", f"{n % 10000:05d}.png", f"{n % 10000}.png"]
    seen: set[str] = set()
    paths: list[Path] = []
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        paths.append(COVER_DIR / name)
    return paths


def find_existing_cover(song_id: str | int) -> str | None:
    for path in local_cover_paths(song_id):
        if path.exists() and path.stat().st_size > 0:
            return f"assets/official-covers/{path.name}"
    return None


def load_alias_map(path: Path | None = None) -> dict[int, list[str]]:
    """song_id -> alias list（柚子别名）。"""
    src = path or ALIAS_CACHE
    if not src.exists():
        return {}
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    rows = data if isinstance(data, list) else data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return {}
    out: dict[int, list[str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            sid = int(row.get("song_id"))
        except (TypeError, ValueError):
            continue
        aliases = row.get("Alias") or row.get("alias") or []
        if isinstance(aliases, list):
            cleaned = [str(a).strip() for a in aliases if str(a).strip()]
            if cleaned:
                out[sid] = cleaned
    return out


def fetch_aliases() -> dict[int, list[str]]:
    log(f"Fetching aliases: {ALIAS_URL}")
    try:
        download_to_file(ALIAS_URL, ALIAS_CACHE, timeout=120)
    except Exception as err:
        log(f"[warn] alias fetch failed: {err}")
        if ALIAS_CACHE.exists():
            log(f"Using cached aliases: {ALIAS_CACHE}")
        else:
            return {}
    alias_map = load_alias_map(ALIAS_CACHE)
    log(f"Alias entries: {len(alias_map)}")
    return alias_map


def resolve_aliases(song_id: str, alias_map: dict[int, list[str]]) -> list[str]:
    try:
        n = int(song_id)
    except (TypeError, ValueError):
        return []
    if n in alias_map:
        return list(alias_map[n])
    base = n % 10000
    if base in alias_map:
        return list(alias_map[base])
    return []


def normalize_song(row: dict, cover_rel: str, alias_map: dict[int, list[str]] | None = None) -> dict:
    basic = row.get("basic_info") if isinstance(row.get("basic_info"), dict) else {}
    levels = row.get("level") if isinstance(row.get("level"), list) else []
    charts = row.get("charts") if isinstance(row.get("charts"), list) else []
    master_charter = ""
    if len(charts) >= 4 and isinstance(charts[3], dict):
        master_charter = str(charts[3].get("charter") or "")
    elif charts and isinstance(charts[-1], dict):
        master_charter = str(charts[-1].get("charter") or "")

    song_id = str(row.get("id") or "")
    title = str(basic.get("title") or row.get("title") or "Untitled")
    artist = str(basic.get("artist") or "Unknown")
    aliases = resolve_aliases(song_id, alias_map or {})
    cover_name = Path(cover_rel).name
    return {
        "id": song_id,
        "title": title,
        "artist": artist,
        "designer": master_charter,
        "uploader": "",
        "levels": levels,
        "tags": [str(basic.get("genre") or "")] if basic.get("genre") else [],
        "publicTags": [str(basic.get("from") or "")] if basic.get("from") else [],
        "type": str(row.get("type") or ""),
        "genre": str(basic.get("genre") or ""),
        "version": str(basic.get("from") or ""),
        "aliases": aliases,
        "bpm": basic.get("bpm"),
        "plays": None,
        "likes": None,
        "comments": None,
        "cover": cover_rel,
        "coverKey": cover_name.rsplit(".", 1)[0],
    }


def download_cover_for_song(song_id: str, retries: int = 2) -> str | None:
    """多 CDN × 多 key 回退；本地按 song_id.png 存，避免 DX/SD 错绑。"""
    existing = find_existing_cover(song_id)
    if existing:
        return existing

    n = parse_song_id(song_id)
    dest = COVER_DIR / f"{n}.png"
    last_err = ""
    for key in cover_key_candidates(song_id):
        for tmpl in COVER_URL_TEMPLATES:
            url = tmpl.format(key=key)
            for attempt in range(retries):
                try:
                    download_to_file(url, dest, timeout=60)
                    if dest.exists() and dest.stat().st_size > 0:
                        return f"assets/official-covers/{dest.name}"
                    last_err = "empty body"
                except (
                    urllib.error.HTTPError,
                    urllib.error.URLError,
                    TimeoutError,
                    subprocess.CalledProcessError,
                    RuntimeError,
                    OSError,
                ) as err:
                    last_err = str(err)
                    if dest.exists():
                        dest.unlink(missing_ok=True)
                    time.sleep(0.12 * (attempt + 1))
    log(f"  [cover fail] {song_id}: {last_err}")
    return None


def write_catalog(songs: list[dict], source: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "syncedAt": utc_now_iso(),
        "source": source,
        "sort": "official_all",
        "count": len(songs),
        "songs": songs,
    }
    CATALOG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync official maimai catalog from Diving-Fish")
    parser.add_argument("--music-data-url", default=MUSIC_DATA_URL)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--skip-covers", action="store_true")
    parser.add_argument(
        "--from-file",
        default="",
        help="optional local music_data.json path (skip network fetch)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if args.from_file:
        src = Path(args.from_file)
        log(f"Loading music_data from file: {src}")
        data = json.loads(src.read_text(encoding="utf-8"))
        source = str(src)
    else:
        log(f"Fetching music_data: {args.music_data_url}")
        try:
            download_to_file(args.music_data_url, MUSIC_CACHE, timeout=120)
            data = json.loads(MUSIC_CACHE.read_text(encoding="utf-8"))
        except Exception as err:
            log(f"[error] music_data failed: {err}")
            if MUSIC_CACHE.exists():
                log(f"Trying cached file: {MUSIC_CACHE}")
                data = json.loads(MUSIC_CACHE.read_text(encoding="utf-8"))
            else:
                return 1
        source = args.music_data_url

    if not isinstance(data, list):
        log("[error] unexpected music_data shape")
        return 1

    log(f"Songs in music_data: {len(data)}")
    alias_map = fetch_aliases()

    rows: list[dict] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        sid = str(row.get("id") or "").strip()
        if not sid:
            continue
        rows.append(row)

    song_ids = [str(row["id"]).strip() for row in rows]
    log(f"Songs to resolve covers: {len(song_ids)}")

    cover_map: dict[str, str] = {}
    if not args.skip_covers:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
            futures = {pool.submit(download_cover_for_song, sid): sid for sid in song_ids}
            done = 0
            for fut in as_completed(futures):
                sid = futures[fut]
                done += 1
                rel = fut.result()
                if rel:
                    cover_map[sid] = rel
                if done % 50 == 0 or done == len(futures):
                    log(f"[covers] {done}/{len(futures)} checked, ok {len(cover_map)}")
    else:
        for sid in song_ids:
            rel = find_existing_cover(sid)
            if rel:
                cover_map[sid] = rel

    songs_out: list[dict] = []
    skipped = 0
    with_alias = 0
    type_counts: dict[str, int] = {}
    for row in rows:
        sid = str(row["id"]).strip()
        rel = cover_map.get(sid)
        if not rel:
            skipped += 1
            continue
        song = normalize_song(row, rel, alias_map)
        t = song.get("type") or "?"
        type_counts[t] = type_counts.get(t, 0) + 1
        if song.get("aliases"):
            with_alias += 1
        songs_out.append(song)

    write_catalog(songs_out, source)
    type_summary = ", ".join(f"{k}={v}" for k, v in sorted(type_counts.items()))
    log(
        f"Wrote {len(songs_out)} songs ({type_summary}; "
        f"with aliases {with_alias}, skipped no-cover {skipped}) -> {CATALOG_PATH}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
