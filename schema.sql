-- Source of truth: raw ingestion + dedup
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  csp TEXT NOT NULL,
  url TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_en TEXT,
  pub_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(csp, url, title_en)
);

-- Denormalized read table: all languages including English
CREATE TABLE IF NOT EXISTS localized_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  csp TEXT NOT NULL,
  lang TEXT NOT NULL,
  url TEXT NOT NULL,
  pub_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  target TEXT,
  features TEXT,
  regions TEXT,
  status TEXT,
  model_used TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(article_id, lang)
);

-- Hot-path indexes: no JOIN needed
CREATE INDEX IF NOT EXISTS idx_lc_lang_csp_date ON localized_content(lang, csp, pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_lc_lang_date ON localized_content(lang, pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_csp ON articles(csp);

CREATE TABLE IF NOT EXISTS translation_job_state (
  article_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  reason TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (article_id, lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_job_state_updated_at
ON translation_job_state(updated_at);
