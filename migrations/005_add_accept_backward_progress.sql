-- Per-user sync setting: accept backward progress (progress lower than stored value).
-- 1 = accept (default), 0 = reject backward progress uploads.
ALTER TABLE users ADD COLUMN accept_backward_progress INTEGER NOT NULL DEFAULT 1;
