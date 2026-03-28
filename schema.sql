-- Articles table (English originals = source of truth)
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  csp TEXT NOT NULL,           -- aws, gcp, azure
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  category TEXT,
  pub_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(csp, url)
);

-- Translations table (multi-language summaries)
CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  lang TEXT NOT NULL,          -- ko, ja, en, zh
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

CREATE INDEX IF NOT EXISTS idx_articles_csp ON articles(csp);
CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON translations(lang);
CREATE INDEX IF NOT EXISTS idx_translations_article ON translations(article_id);
