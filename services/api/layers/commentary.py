"""Layer 3: Write commentary outputs to the shared commentary_outputs table."""
from datetime import datetime, timezone


def write_commentary_outputs(db, pool_id: str, cards: list[dict]) -> None:
    """
    Insert new commentary cards.
    Old cards are NOT deleted — they expire via expires_at or manual pruning.
    Each pipeline run appends fresh cards; frontend queries most recent by priority.
    """
    if not cards:
        return

    now = datetime.now(timezone.utc).isoformat()
    for card in cards:
        card['created_at'] = now
        # Default: expire commentary after 24h unless specified
        if 'expires_at' not in card:
            card['expires_at'] = None

    db.from_('commentary_outputs') \
        .insert(cards, returning='minimal') \
        .execute()

    print(f"[layers.commentary] Wrote {len(cards)} commentary cards for pool {pool_id}")


def prune_expired_commentary(db) -> None:
    """Remove commentary cards past their expires_at timestamp."""
    db.from_('commentary_outputs') \
        .delete() \
        .lt('expires_at', datetime.now(timezone.utc).isoformat()) \
        .not_.is_('expires_at', 'null') \
        .execute()
