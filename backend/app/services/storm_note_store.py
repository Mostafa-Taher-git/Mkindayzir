"""Storm-note filesystem layer.

Each storm card has one .md file under DATA_DIR/storm-notes/{stormId}.md.
Saves write a .bak next to it for crash safety. Wiki-style [[links]] are
extracted from the markdown so the canvas can offer broken-link prompts and
a backlinks panel without parsing markdown in the client.
"""
from __future__ import annotations

import re
import asyncio
from pathlib import Path
from typing import Iterable

from app.config import settings


WIKI_LINK_RE = re.compile(r"\[\[([^\]\n]+?)\]\]")
BACKUP_SUFFIX = ".bak"
NOTE_SUBDIR = "storm-notes"


def notes_root() -> Path:
    return Path(settings.DATA_DIR) / NOTE_SUBDIR


def _note_path(storm_id: str) -> Path:
    return notes_root() / f"{storm_id}.md"


def _backup_path(storm_id: str) -> Path:
    return notes_root() / f"{storm_id}{BACKUP_SUFFIX}"


def _ensure_root() -> None:
    notes_root().mkdir(parents=True, exist_ok=True)


async def read_note(storm_id: str) -> str:
    """Return the note body. Empty string if the file doesn't exist yet."""
    path = _note_path(storm_id)
    if not path.exists():
        return ""
    # Path I/O is blocking — run in a thread so the event loop stays free.
    return await asyncio.to_thread(path.read_text, "utf-8")


async def write_note(storm_id: str, body: str) -> None:
    """Atomic-ish write: copy current file to .bak, then write the new one."""
    def _write() -> None:
        _ensure_root()
        main = _note_path(storm_id)
        if main.exists():
            main.replace(_backup_path(storm_id))
        main.write_text(body, encoding="utf-8")

    await asyncio.to_thread(_write)


def extract_wiki_links(body: str) -> list[str]:
    """Return the list of unique wiki targets, in first-seen order."""
    seen: dict[str, None] = {}
    for m in WIKI_LINK_RE.finditer(body or ""):
        target = m.group(1).strip()
        if target and target not in seen:
            seen[target] = None
    return list(seen.keys())


def backlink_index(notes: Iterable[tuple[str, str]]) -> dict[str, list[str]]:
    """Given (stormId, body) pairs, return {targetName -> [stormId, ...]}.

    Used to build the backlinks panel for a note without re-reading files
    client-side.
    """
    out: dict[str, list[str]] = {}
    for storm_id, body in notes:
        for name in extract_wiki_links(body):
            out.setdefault(name, []).append(storm_id)
    return out


NOTE_IMG_SUBDIR = "storm-note-images"
ALLOWED_IMG = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}


def images_root() -> Path:
    return Path(settings.DATA_DIR) / NOTE_IMG_SUBDIR


def _image_path(stored_name: str) -> Path:
    return images_root() / stored_name


def save_note_image(filename: str, data: bytes) -> str:
    """Persist an uploaded image; returns its public relative URL."""
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise ValueError("unsupported image type")
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("image too large")
    images_root().mkdir(parents=True, exist_ok=True)
    stored = f"{__import__('uuid').uuid4().hex}{ext}"
    _image_path(stored).write_bytes(data)
    return f"/api/storms/images/{stored}"


def image_path_safe(stored_name: str):
    """Resolve an image path, refusing anything that escapes the image dir."""
    candidate = _image_path(stored_name).resolve()
    if candidate.parent != images_root().resolve() or not candidate.exists():
        return None
    return candidate
