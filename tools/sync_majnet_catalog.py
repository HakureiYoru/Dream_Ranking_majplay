#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync MajdataNet charts into local catalog + covers (top N).

Default: sort=likep (likes descending), same as MajdataNet HomePage.
Dedupes by title+artist and by cover image hash so the same jacket
does not appear twice in the guess pool.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DATA_DIR = WEB / "data"
COVER_DIR = WEB / "assets" / "majnet-covers"
CATALOG_PATH = DATA_DIR / "majnet_catalog.json"

DEFAULT_API_ROOT = "https://majdata.net/api3/api"
DEFAULT_LIMIT = 200
DEFAULT_CONCURRENCY = 16
DEFAULT_SORT = "likep"  # MajdataNet: '' date, likep, commp, playp
PAGE_SIZE = 30
USER_AGENT = "DreamRankingMajplayGuessSync/1.2"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def log(msg: str) -> None:
    print(msg, flush=True)


def request_json(url: str, timeout: float = 30.0) -> object:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def request_bytes(url: str, timeout: float = 45.0) -> tuple[bytes, str | None]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get("Content-Type")
        return resp.read(), content_type


def list_page(api_root: str, page: int, sort: str = DEFAULT_SORT) -> list[dict]:
    params = urllib.parse.urlencode({"sort": sort, "page": str(page), "search": ""})
    url = f"{api_root.rstrip('/')}/maichart/list?{params}"
    data = request_json(url)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        rows = data.get("value")
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def song_identity_key(row: dict) -> str:
    """????+????????????????????"""
    title = " ".join(str(row.get("title") or "").strip().lower().split())
    artist = " ".join(str(row.get("artist") or "").strip().lower().split())
    return f"{title}\0{artist}"


def list_top_unique(api_root: str, need: int, sort: str = DEFAULT_SORT, max_pages: int = 40) -> list[dict]:
    """? sort ???? title+artist ??????? need ??"""
    ordered: list[dict] = []
    seen_ids: set[str] = set()
    seen_identity: set[str] = set()
    page = 0
    while len(ordered) < need and page < max_pages:
        try:
            rows = list_page(api_root, page, sort=sort)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            log(f"[list error] page {page}: {err}")
            break
        if not rows:
            break
        added = 0
        skipped_dup = 0
        for row in rows:
            sid = str(row.get("id") or "").strip()
            if not sid or sid in seen_ids:
                continue
            ident = song_identity_key(row)
            if ident in seen_identity:
                skipped_dup += 1
                continue
            seen_ids.add(sid)
            seen_identity.add(ident)
            ordered.append(row)
            added += 1
            if len(ordered) >= need:
                break
        log(
            f"[list] sort={sort} page {page}: +{added} "
            f"(unique {len(ordered)}, skipped dup {skipped_dup})"
        )
        page += 1
    return ordered[:need]


def fetch_plays(api_root: str, song_id: str, retries: int = 3) -> dict:
    url = f"{api_root.rstrip('/')}/maichart/{urllib.parse.quote(song_id)}/interactsum"
    last_err = ""
    for attempt in range(retries):
        try:
            data = request_json(url)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = str(err)
            time.sleep(0.25 * (attempt + 1))
            continue
        if not isinstance(data, dict):
            return {"id": song_id, "ok": False, "error": "invalid interactsum"}
        try:
            plays_n = int(data.get("plays"))
        except (TypeError, ValueError):
            plays_n = -1
        likes = data.get("likes")
        comments = data.get("comments")
        try:
            likes_n = int(likes) if not isinstance(likes, list) else len(likes)
        except (TypeError, ValueError):
            likes_n = None
        try:
            comments_n = int(comments) if not isinstance(comments, list) else len(comments)
        except (TypeError, ValueError):
            comments_n = None
        return {
            "id": song_id,
            "ok": True,
            "plays": plays_n,
            "likes": likes_n,
            "comments": comments_n,
        }
    return {"id": song_id, "ok": False, "error": last_err or "request failed"}


def ext_from_content_type(content_type: str | None) -> str:
    if not content_type:
        return ".jpg"
    mime = content_type.split(";")[0].strip().lower()
    if mime in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if mime == "image/png":
        return ".png"
    if mime == "image/webp":
        return ".webp"
    if mime == "image/gif":
        return ".gif"
    guessed = mimetypes.guess_extension(mime)
    return guessed or ".jpg"


def safe_song_id(song_id: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in song_id)


def find_existing_cover(song_id: str) -> tuple[str | None, bytes | None]:
    safe_id = safe_song_id(song_id)
    if not COVER_DIR.exists():
        return None, None
    for path in COVER_DIR.glob(f"{safe_id}.*"):
        if path.is_file() and path.stat().st_size > 0:
            body = path.read_bytes()
            return f"assets/majnet-covers/{path.name}", body
    return None, None


def download_cover(api_root: str, song_id: str, cover_dir: Path) -> tuple[str | None, bytes | None]:
    url = f"{api_root.rstrip('/')}/maichart/{urllib.parse.quote(song_id)}/image"
    try:
        body, content_type = request_bytes(url)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
        log(f"  [cover fail] {song_id}: {err}")
        return None, None
    if not body:
        log(f"  [cover empty] {song_id}")
        return None, None
    ext = ext_from_content_type(content_type)
    filename = f"{safe_song_id(song_id)}{ext}"
    path = cover_dir / filename
    path.write_bytes(body)
    return f"assets/majnet-covers/{filename}", body


def normalize_song(row: dict, stats: dict, cover: str) -> dict:
    levels = row.get("levels")
    if not isinstance(levels, list):
        levels = []
    tags = row.get("tags") if isinstance(row.get("tags"), list) else []
    public_tags = row.get("publicTags") if isinstance(row.get("publicTags"), list) else []
    return {
        "id": str(row.get("id") or ""),
        "title": str(row.get("title") or "Untitled"),
        "artist": str(row.get("artist") or "Unknown"),
        "designer": str(row.get("designer") or ""),
        "uploader": str(row.get("uploader") or ""),
        "levels": levels,
        "tags": [str(t) for t in tags],
        "publicTags": [str(t) for t in public_tags],
        "timestamp": row.get("timestamp") or "",
        "plays": stats.get("plays"),
        "likes": stats.get("likes"),
        "comments": stats.get("comments"),
        "cover": cover,
    }


def load_existing_catalog(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    songs = data.get("songs") if isinstance(data, dict) else None
    if not isinstance(songs, list):
        return {}
    by_id = {}
    for song in songs:
        if isinstance(song, dict) and song.get("id"):
            by_id[str(song["id"])] = song
    return by_id


def write_catalog(path: Path, songs: list[dict], limit: int, api_root: str, sort: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "syncedAt": utc_now_iso(),
        "limit": limit,
        "sort": sort,
        "apiRoot": api_root,
        "count": len(songs),
        "songs": songs,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync MajdataNet top charts (default sort=likep)")
    parser.add_argument("--api-root", default=DEFAULT_API_ROOT)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="keep top N unique (default 200)")
    parser.add_argument("--sort", default=DEFAULT_SORT, help="list sort: likep / playp / commp / ''")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument(
        "--buffer",
        type=int,
        default=60,
        help="extra unique candidates beyond limit for cover failures (default 60)",
    )
    parser.add_argument("--max-pages", type=int, default=40, help="list page cap while deduping")
    parser.add_argument("--skip-covers", action="store_true", help="only update catalog metadata")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_root = args.api_root.rstrip("/")
    limit = max(1, args.limit)
    buffer_n = max(0, args.buffer)
    sort = str(args.sort or DEFAULT_SORT)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COVER_DIR.mkdir(parents=True, exist_ok=True)

    existing = load_existing_catalog(CATALOG_PATH)
    log(f"API: {api_root}")
    log(f"Target top unique: {limit} (sort={sort}, pageSize={PAGE_SIZE})")
    log(f"Existing catalog entries: {len(existing)}")

    fetch_n = limit + buffer_n
    candidates = list_top_unique(api_root, fetch_n, sort=sort, max_pages=max(1, args.max_pages))
    log(f"Unique candidates from {sort} list: {len(candidates)}")
    if len(candidates) < limit:
        log(f"Warning: only {len(candidates)} unique charts, want {limit}")

    by_id = {str(row["id"]): row for row in candidates if row.get("id")}
    ordered_ids = [str(row["id"]) for row in candidates if row.get("id")]

    all_stats: dict[str, dict] = {}
    need_fetch: list[str] = []
    for sid in ordered_ids:
        prev = existing.get(sid)
        # likep ????????? likes?????
        if prev is not None and prev.get("likes") is not None and sort == "likep":
            all_stats[sid] = {
                "id": sid,
                "ok": True,
                "plays": int(prev.get("plays") or 0) if prev.get("plays") is not None else None,
                "likes": int(prev.get("likes") or 0),
                "comments": prev.get("comments"),
            }
        elif prev is not None and prev.get("plays") is not None and sort == "playp":
            all_stats[sid] = {
                "id": sid,
                "ok": True,
                "plays": int(prev.get("plays") or 0),
                "likes": prev.get("likes"),
                "comments": prev.get("comments"),
            }
        else:
            need_fetch.append(sid)
    log(f"Reuse stats: {len(all_stats)}, fetch interactsum: {len(need_fetch)}")

    failed = 0
    if need_fetch:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
            futures = {pool.submit(fetch_plays, api_root, sid): sid for sid in need_fetch}
            done = 0
            for fut in as_completed(futures):
                done += 1
                result = fut.result()
                if done % 25 == 0 or done == len(futures):
                    log(f"[stats] {done}/{len(futures)} checked, ok {len(all_stats)}, failed {failed}")
                if not result.get("ok"):
                    failed += 1
                    continue
                all_stats[result["id"]] = result

    songs_out: list[dict] = []
    seen_cover_hash: set[str] = set()
    skipped_cover_dup = 0
    for sid in ordered_ids:
        if len(songs_out) >= limit:
            break
        row = by_id.get(sid)
        stats = all_stats.get(sid)
        if not row or not stats:
            continue

        cover = None
        body: bytes | None = None
        if not args.skip_covers:
            prev = existing.get(sid)
            if prev and prev.get("cover"):
                prev_path = WEB / str(prev["cover"]).replace("\\", "/")
                if prev_path.exists() and prev_path.stat().st_size > 0:
                    cover = str(prev["cover"]).replace("\\", "/")
                    body = prev_path.read_bytes()
            if not cover:
                cover, body = find_existing_cover(sid)
            if not cover:
                cover, body = download_cover(api_root, sid, COVER_DIR)
        else:
            prev = existing.get(sid)
            cover = (prev or {}).get("cover") or None
            if not cover:
                cover, body = find_existing_cover(sid)
            elif cover:
                prev_path = WEB / str(cover).replace("\\", "/")
                if prev_path.exists():
                    body = prev_path.read_bytes()

        if not cover:
            log(f"  [skip no cover] {sid} {row.get('title')}")
            continue

        if body:
            digest = hashlib.sha1(body).hexdigest()
            if digest in seen_cover_hash:
                skipped_cover_dup += 1
                continue
            seen_cover_hash.add(digest)

        songs_out.append(normalize_song(row, stats, cover))
        if len(songs_out) % 25 == 0:
            log(f"[covers] saved {len(songs_out)}/{limit}")

    write_catalog(CATALOG_PATH, songs_out, limit, api_root, sort)
    top_likes = songs_out[0].get("likes") if songs_out else None
    bottom_likes = songs_out[-1].get("likes") if songs_out else None
    top_plays = songs_out[0].get("plays") if songs_out else None
    bottom_plays = songs_out[-1].get("plays") if songs_out else None
    log(
        f"Wrote {len(songs_out)} songs "
        f"(likes {top_likes} .. {bottom_likes}, plays {top_plays} .. {bottom_plays}, "
        f"cover-dup skipped {skipped_cover_dup}) -> {CATALOG_PATH}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
