-- Ensure all draft tables that the client subscribes to are in the
-- supabase_realtime publication with REPLICA IDENTITY FULL.
-- Without this, Postgres never ships row-level change events and clients
-- fall back to the 5-second poll, causing visible lag.

alter table draft.feed           replica identity full;
alter table draft.actual_picks   replica identity full;
alter table draft.team_overrides replica identity full;
alter table draft.live_cards     replica identity full;
alter table draft.queues         replica identity full;
alter table draft.finalized_picks replica identity full;

do $$ begin alter publication supabase_realtime add table draft.feed;           exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table draft.actual_picks;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table draft.team_overrides; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table draft.live_cards;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table draft.queues;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table draft.finalized_picks; exception when duplicate_object then null; end $$;
