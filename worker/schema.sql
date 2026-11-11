-- Schéma Cloudflare D1 pour les rappels Web Push. À appliquer :  npx wrangler d1 execute wird-push --file=worker/schema.sql
-- Aucune donnée coranique ni d'évaluation : uniquement ce qui est nécessaire pour envoyer les rappels.
CREATE TABLE IF NOT EXISTS subscribers (
  endpoint           TEXT PRIMARY KEY,          -- URL d'abonnement Push (identifiant)
  p256dh             TEXT NOT NULL,             -- clé publique de l'abonnement
  auth               TEXT NOT NULL,             -- secret d'authentification de l'abonnement
  tz                 TEXT NOT NULL DEFAULT 'UTC',
  prefs              TEXT NOT NULL,             -- JSON NotificationPrefs
  last_activity_date TEXT,                      -- AAAA-MM-JJ (date locale) de la dernière activité
  unfinished_date    TEXT,                      -- AAAA-MM-JJ si un travail est resté inachevé
  sent               TEXT NOT NULL DEFAULT '{}',-- JSON { daily?: date, second?: date, unfinished?: date, comeback?: date }
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_activity ON subscribers (last_activity_date);
