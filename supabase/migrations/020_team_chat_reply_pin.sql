-- Reply-to and pin support for team chat messages.

ALTER TABLE team_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id text REFERENCES team_chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_user_name text,
  ADD COLUMN IF NOT EXISTS reply_to_message_type text,
  ADD COLUMN IF NOT EXISTS reply_to_preview text,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by_user_id text;

CREATE INDEX IF NOT EXISTS team_chat_messages_pinned_idx
  ON team_chat_messages (pinned_at DESC)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS team_chat_messages_type_created_idx
  ON team_chat_messages (message_type, created_at DESC);
