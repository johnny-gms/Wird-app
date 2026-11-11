/**
 * Règles de rappel — fonction PURE, sans dépendance au navigateur : elle sera exécutée par le Cron Trigger du
 * Worker (voir worker/) et est testée ici. Elle décide quels rappels envoyer à un abonné à un instant donné.
 *
 * Principes : relances arrêtées dès la reprise d'activité, un seul message de reprise par absence,
 * jamais de ton culpabilisant, chaque catégorie désactivable et programmable.
 */
import { diffDays } from '@/engine/dates';
import type { NotificationPrefs } from '@/engine/types';

export type ReminderKind = 'daily' | 'second' | 'unfinished' | 'comeback';

export interface SubscriberState {
  prefs: NotificationPrefs;
  /** Date locale (AAAA-MM-JJ) de la dernière activité de travail, ou null si jamais. */
  lastActivityDate: string | null;
  /** Date à laquelle un travail a été laissé inachevé (dernière session interrompue), ou null. */
  unfinishedDate: string | null;
  /** Dernier envoi par catégorie : date locale concernée. Évite les doublons. */
  sent: Partial<Record<ReminderKind, string>>;
}

export interface Reminder {
  kind: ReminderKind;
  title: string;
  body: string;
  /** Valeur à enregistrer dans `sent[kind]` après envoi. */
  stamp: string;
}

export const MESSAGES: Record<ReminderKind, { title: string; body: string }> = {
  daily: { title: 'Votre Wird du jour', body: 'Votre programme est prêt, à votre rythme.' },
  second: { title: 'Un petit moment pour votre Wird ?', body: 'Quelques minutes suffisent aujourd’hui.' },
  unfinished: { title: 'Reprendre où vous en étiez', body: 'Vous aviez commencé hier : reprenez quand vous voulez, sans pression.' },
  comeback: { title: 'Bon retour quand vous serez prêt', body: 'Rien à rattraper : votre Wird reprend simplement là où vous l’aviez laissé.' },
};

/** `localDate` / `localTime` : date (AAAA-MM-JJ) et heure (HH:MM) dans le fuseau de l'abonné. */
export function decideReminders(s: SubscriberState, localDate: string, localTime: string): Reminder[] {
  const out: Reminder[] = [];
  const p = s.prefs;
  const workedToday = s.lastActivityDate === localDate;
  const due = (time: string) => localTime >= time;
  const push = (kind: ReminderKind, stamp = localDate) => out.push({ kind, ...MESSAGES[kind], stamp });

  if (!workedToday) {
    // Rappel quotidien
    if (p.daily.enabled && due(p.daily.time) && s.sent.daily !== localDate) push('daily');
    // Deuxième rappel : seulement après le premier créneau, et si rien n'a été fait
    if (p.second.enabled && due(p.second.time) && s.sent.second !== localDate && (!p.daily.enabled || p.second.time > p.daily.time)) push('second');
    // Travail inachevé : le lendemain (ou plus tard) de l'interruption, une seule fois par interruption
    if (p.unfinished.enabled && s.unfinishedDate && s.unfinishedDate < localDate && due(p.unfinished.time) && s.sent.unfinished !== s.unfinishedDate) push('unfinished', s.unfinishedDate);
  }
  // Reprise après absence : un seul message par période d'absence, jamais si l'utilisateur a travaillé aujourd'hui
  if (p.comeback.enabled && s.lastActivityDate && !workedToday) {
    const away = diffDays(s.lastActivityDate, localDate);
    if (away >= p.comeback.afterDays && due(p.comeback.time) && s.sent.comeback !== s.lastActivityDate) push('comeback', s.lastActivityDate);
  }

  // Pas de cumul : un seul message par passage du cron (le plus utile), les autres seront évalués au passage suivant.
  const rank: ReminderKind[] = ['comeback', 'unfinished', 'second', 'daily'];
  out.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
  // Si une reprise est envoyée, on n'envoie pas en plus le quotidien du jour
  return out.length ? [out[0]] : [];
}

