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
