"""
Runtime capability probes for optional schema objects.

The app is often deployed (or demoed) against a database where a later migration
has not been applied yet. PostgREST then rejects the whole request with
``PGRST204`` / ``PGRST205``, which surfaces as an opaque 500 deep in a write.

Instead of that, probe the shape once, cache the answer and let the caller
degrade just the feature that needs it. Nothing is silently written to a
different place: a probe only decides whether an optional column/table exists.
"""

_cache: dict[tuple[str, str], bool] = {}

_MISSING_CODES = ("PGRST204", "PGRST205", "42703", "42P01")


def _probe(db, table: str, column: str) -> bool:
    key = (table, column)
    if key in _cache:
        return _cache[key]

    try:
        db.table(table).select(column).limit(1).execute()
        ok = True
    except Exception as exc:
        text = str(exc)
        if any(code in text for code in _MISSING_CODES):
            ok = False
        else:
            # Transient/other failure: do not permanently disable the feature.
            return True

    _cache[key] = ok
    return ok


def has_column(db, table: str, column: str) -> bool:
    """True when ``table.column`` exists in the live database."""
    return _probe(db, table, column)


def has_table(db, table: str) -> bool:
    """True when ``table`` exists in the live database."""
    return _probe(db, table, "*")


def payments_support_lines(db) -> bool:
    """True when the v2 ``payments.line_id`` column has been migrated in."""
    return has_column(db, "payments", "line_id")


def reset_cache() -> None:
    """Clear cached probes (used by tests and long-lived workers after a deploy)."""
    _cache.clear()
