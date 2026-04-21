"""Layer 1: Write probability inputs to the shared probability_inputs table."""


def write_probability_inputs(db, rows: list[dict]) -> None:
    """
    Upsert probability input rows.
    Uses insert with on_conflict ignore — probability snapshots are append-only.
    """
    if not rows:
        return

    db.from_('probability_inputs') \
        .insert(rows, returning='minimal') \
        .execute()

    print(f"[layers.probability] Wrote {len(rows)} probability inputs")
