alter table draft.feed
  add column if not exists pick_is_in_at timestamptz,
  add column if not exists provider_expires_at timestamptz;
