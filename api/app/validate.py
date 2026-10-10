"""Server-side song validation: the same rules as web/src/song/validate.ts.

Never trust what a browser sends; this keeps stored songs loadable everywhere.
"""

from typing import Any

EFFECTS = {"0", "1", "2", "3", "4", "A", "B", "D", "F", "S", "V"}


def _int(v: Any, lo: int, hi: int) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def _opt(v: Any, lo: int, hi: int) -> bool:
    return v is None or _int(v, lo, hi)


def _macro(m: Any) -> bool:
    return (
        isinstance(m, dict)
        and isinstance(m.get("values"), list)
        and len(m["values"]) <= 255
        and all(_int(v, -128, 127) for v in m["values"])
        and _opt(m.get("loop"), 0, 254)
        and _opt(m.get("release"), 0, 254)
    )


def _cell(c: Any) -> bool:
    return (
        isinstance(c, dict)
        and _opt(c.get("note"), -2, 127)
        and _opt(c.get("instrument"), 0, 254)
        and _opt(c.get("volume"), 0, 15)
        and (c.get("effect") is None or c.get("effect") in EFFECTS)
        and _int(c.get("param", 0), 0, 255)
    )


def song_problem(s: Any) -> str | None:
    """Why `s` isn't a valid ChipForge song, or None if it is."""
    if not isinstance(s, dict) or s.get("version") != 1:
        return "not a version 1 song"
    if not isinstance(s.get("title"), str) or len(s["title"]) > 200:
        return "bad title"
    if not (
        _int(s.get("bpm"), 30, 300)
        and _int(s.get("speed"), 1, 31)
        and _int(s.get("rowsPerBeat"), 1, 32)
    ):
        return "bad tempo settings"
    rows = s.get("patternLength")
    if not _int(rows, 1, 256):
        return "bad pattern length"
    instruments, patterns, order = s.get("instruments"), s.get("patterns"), s.get("order")
    if not isinstance(instruments, list) or len(instruments) > 64:
        return "bad instruments"
    for inst in instruments:
        if not isinstance(inst, dict) or not isinstance(inst.get("name"), str):
            return "bad instrument"
        if not all(_macro(inst.get(k)) for k in ("volume", "duty", "pitch", "arpeggio")):
            return "bad instrument macro"
    if not isinstance(patterns, list) or not 1 <= len(patterns) <= 256:
        return "bad patterns"
    for p in patterns:
        channels = p.get("channels") if isinstance(p, dict) else None
        if not isinstance(channels, list) or len(channels) != 4:
            return "a pattern needs four channels"
        for cells in channels:
            if (
                not isinstance(cells, list)
                or len(cells) != rows
                or not all(_cell(c) for c in cells)
            ):
                return "bad pattern cells"
    if not isinstance(order, list) or not 1 <= len(order) <= 256:
        return "bad order"
    if not all(_int(o, 0, len(patterns) - 1) for o in order):
        return "order points at a missing pattern"
    if not _int(s.get("loopPoint"), 0, len(order) - 1):
        return "bad loop point"
    return None
