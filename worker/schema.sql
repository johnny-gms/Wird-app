-- Schéma Cloudflare D1 pour les rappels Web Push.
--   npx wrangler d1 execute wird-push --remote --file=worker/schema.sql
-- Aucune donnée coranique ni d'évaluation : uniquement ce qui est nécessaire pour envoyer les rappels.
CREATE TABLE IF NOT EXISTS subscribers (
  endpoint           TEXT PRIMARY KEY,           -- URL d'abonnement Push (identifiant)
  p256dh             TEXT NOT NULL,              -- clé publique de l'abonnement
  auth               TEXT NOT NULL,              -- secret d'authentification de l'abonnement
  token_hash         TEXT NOT NULL,              -- SHA-256 du jeton secret de l'appareil
  tz                 TEXT NOT NULL DEFAULT 'UTC',
  prefs              TEXT NOT NULL,              -- JSON NotificationPrefs (4 catégories)
  last_activity_date TEXT,                       -- AAAA-MM-JJ (date locale) de la dernière activité
  unfinished_date    TEXT,                       -- AAAA-MM-JJ si un travail est resté inachevé
  sent               TEXT NOT NULL DEFAULT '{}', -- JSON { daily?, second?, unfinished?, comeback? } : dates déjà notifiées
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_activity ON subscribers (last_activity_date);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Synchronisation multi-appareils (activée une fois l'authentification en place)
CREATE TABLE IF NOT EXISTS sync_records (
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,                 -- ex. verse:2005, goal:ab12, settings:theme
  hlc     TEXT NOT NULL,                 -- horloge hybride : la version la plus récente gagne
  del     INTEGER NOT NULL DEFAULT 0,    -- 1 = suppression (tombstone)
  value   TEXT NOT NULL DEFAULT 'null',
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_sync_hlc ON sync_records (user_id, hlc);
