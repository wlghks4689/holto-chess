-- Messages sent from the start screen's "제보 · 문의하기" form, read in the admin inbox.
-- No IP address is stored. contact_email is optional and only kept with the sender's consent.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('feedback', 'bug', 'inquiry', 'support')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  contact_email TEXT,
  locale TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX feedback_status_id ON feedback (status, id DESC);
CREATE INDEX feedback_category_id ON feedback (category, id DESC);
