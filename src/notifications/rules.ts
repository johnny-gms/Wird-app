/**
 * Règles de rappel — fonction PURE, sans dépendance au navigateur : elle sera exécutée par le Cron Trigger du
 * Worker (voir worker/) et est testée ici. Elle décide quels rappels envoyer à un abonné à un instant donné.
 *
 * Principes : relances arrêtées dès la reprise d'activité, un seul message de reprise par absence,
 * jamais de ton culpabilisant, chaque catégorie désactivable et programmable.
 */
import { diffDays } from '../engine/dates';
import type { NotificationPrefs } from '../engine/types';

export type ReminderKind = 'daily' | 'second' | 'unfinished' | 'comeback';

export interface SubscriberState {
  prefs: NotificationPrefs;
  /** Date locale (AAAA-MM-JJ) de la dernière activité de travail, ou null si jamais. */
  lastActivityDate: string | null;
  /** Date à laquelle un travail a été laissé inachevé (dernière session interrompue), ou null. */
  unfinishedDate: string | null;
  /** Dernier envoi par catégorie : date locale concernée. Évite les doublons. */
  sent: Partial<Record<ReminderKind, string>>;
  /** Série (jours consécutifs travaillés) à la date de la dernière activité. Absente ou 0 : inconnue. */
  streak?: number;
}

export interface Reminder {
  kind: ReminderKind;
  title: string;
  body: string;
  /** Valeur à enregistrer dans `sent[kind]` après envoi. */
  stamp: string;
}

export const MESSAGES: Record<ReminderKind, { title: string; body: string }> = {
  daily: { title: 'Ton Wird du jour', body: 'Ton programme est prêt, à ton rythme.' },
  second: { title: 'Un petit moment pour ton Wird ?', body: 'Quelques minutes suffisent aujourd’hui.' },
  unfinished: { title: 'Reprendre où tu en étais', body: 'Tu avais commencé hier : reprends quand tu veux, sans pression.' },
  comeback: { title: 'Bon retour quand tu seras prêt', body: 'Rien à rattraper : ton Wird reprend simplement là où tu l’avais laissé.' },
};

/**
 * Quand l'utilisateur a travaillé hier, les rappels du jour parlent de sa série : encourageant, jamais culpabilisant.
 * (Si la dernière activité est plus ancienne, la série est déjà interrompue : on garde les messages habituels.)
 */
export function streakMessage(kind: 'daily' | 'second', streak: number): { title: string; body: string } | null {
  if (!(streak >= 1)) return null;
  if (streak === 1) {
    return kind === 'daily'
      ? { title: 'Allume ta série 🔥', body: 'Tu as travaillé hier : un petit passage aujourd’hui et ta série démarre.' }
      : { title: 'Ta série n’attend que toi 🔥', body: 'Quelques minutes suffisent pour la lancer.' };
  }
  return kind === 'daily'
    ? { title: `Ta série de ${streak} jours continue 🔥`, body: 'Un petit passage aujourd’hui garde ta flamme allumée.' }
    : { title: 'Garde ta flamme allumée 🔥', body: `${streak} jours d’affilée : quelques minutes suffisent pour ne pas la perdre.` };
}

/**
 * Un rappel n'est envoyé que dans les GRACE_MIN minutes qui suivent l'heure choisie. Au-delà, on le considère comme manqué
 * (service interrompu, rappels activés tard dans la journée…) : jamais de rattrapage, sinon plusieurs notifications s'enchaînent.
 */
export const GRACE_MIN = 30;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** `localDate` / `localTime` : date (AAAA-MM-JJ) et heure (HH:MM) dans le fuseau de l'abonné. Renvoie TOUS les rappels dus, du plus utile au moins utile. */
export function dueReminders(s: SubscriberState, localDate: string, localTime: string): Reminder[] {
  const out: Reminder[] = [];
  const p = s.prefs;
  const workedToday = s.lastActivityDate === localDate;
  const due = (time: string) => {
    const late = minutes(localTime) - minutes(time);
    return late >= 0 && late <= GRACE_MIN;
  };
  const streakAtRisk = s.lastActivityDate !== null && diffDays(s.lastActivityDate, localDate) === 1 ? (s.streak ?? 0) : 0;
  const push = (kind: ReminderKind, stamp = localDate) => {
    const sm = kind === 'daily' || kind === 'second' ? streakMessage(kind, streakAtRisk) : null;
    out.push({ kind, ...(sm ?? MESSAGES[kind]), stamp });
  };

  // Ce que dit la journée, sans jamais empiler : au plus DEUX messages par jour (le matin, puis le soir), et UN SEUL par absence.
  //  - absence longue : un seul message de reprise, puis silence jusqu'au retour ;
  //  - sinon, la veille d'un travail laissé inachevé : ce message remplace le rappel quotidien du jour ;
  //  - sinon : le rappel quotidien, et le soir le deuxième rappel si rien n'a été fait.
  const away = s.lastActivityDate ? diffDays(s.lastActivityDate, localDate) : 0;
  const absent = p.comeback.enabled && s.lastActivityDate !== null && away >= p.comeback.afterDays;
  if (!workedToday) {
    if (absent) {
      if (due(p.comeback.time) && s.sent.comeback !== s.lastActivityDate) push('comeback', s.lastActivityDate!);
    } else {
      const unfinishedDay = p.unfinished.enabled && s.unfinishedDate !== null && diffDays(s.unfinishedDate, localDate) === 1 && s.sent.unfinished !== s.unfinishedDate;
      if (unfinishedDay) {
        if (due(p.unfinished.time)) push('unfinished', s.unfinishedDate!);
      } else if (p.daily.enabled && due(p.daily.time) && s.sent.daily !== localDate) push('daily');
      // Deuxième rappel : seulement après le premier créneau, et si rien n'a été fait
      if (p.second.enabled && due(p.second.time) && s.sent.second !== localDate && (!p.daily.enabled || p.second.time > p.daily.time)) push('second');
    }
  }

  const rank: ReminderKind[] = ['comeback', 'unfinished', 'second', 'daily'];
  out.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
  return out;
}

/** Pas de cumul : un seul message par passage du cron (le plus utile). Le runner marque les autres rappels dus comme couverts (voir dueReminders). */
export function decideReminders(s: SubscriberState, localDate: string, localTime: string): Reminder[] {
  const all = dueReminders(s, localDate, localTime);
  return all.length ? [all[0]] : [];
}

