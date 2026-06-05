CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  spotify_id VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blindtest_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  source_name VARCHAR(255) NOT NULL DEFAULT '',
  question_count INTEGER NOT NULL,
  answer_mode VARCHAR(20) NOT NULL,
  listen_duration_seconds INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blindtest_answers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES blindtest_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  spotify_track_id VARCHAR(255) NOT NULL,
  track_uri VARCHAR(255) NOT NULL,
  expected_title TEXT NOT NULL,
  expected_artists TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  user_title_answer TEXT NOT NULL DEFAULT '',
  user_artist_answer TEXT NOT NULL DEFAULT '',
  is_title_correct BOOLEAN NOT NULL DEFAULT FALSE,
  is_artist_correct BOOLEAN NOT NULL DEFAULT FALSE,
  points INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, spotify_track_id)
);

CREATE INDEX IF NOT EXISTS idx_blindtest_sessions_user_id ON blindtest_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_blindtest_answers_session_id ON blindtest_answers(session_id);
