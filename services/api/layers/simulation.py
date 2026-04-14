"""Layer 2: Write simulation outputs to the shared simulation_outputs table."""
from datetime import datetime, timezone


def write_simulation_outputs(db, standings: list[dict]) -> None:
    """
    Upsert simulation output rows (one per user per pool per window_key).
    Replaces existing row for the same (pool_id, user_id, window_key) combo.
    """
    if not standings:
        return

    now = datetime.now(timezone.utc).isoformat()
    for row in standings:
        row['updated_at'] = now

    # Upsert on the unique constraint
    db.from_('simulation_outputs') \
        .upsert(
            standings,
            on_conflict='pool_id,user_id,window_key',
            returning='minimal'
        ) \
        .execute()

    print(f"[layers.simulation] Wrote {len(standings)} simulation outputs")
