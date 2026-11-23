import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATIONS } from '@/engine/config';
import { decideReminders, streakMessage, type SubscriberState } from './rules';

const base = (over: Partial<SubscriberState> = {}): SubscriberState => ({ prefs: structuredClone(DEFAULT_NOTIFICATIONS), lastActivityDate: '2026-03-09', unfinishedDate: null, sent: {}, ...over });
const kinds = (s: SubscriberState, d: string, t: string) => decideReminders(s, d, t).map((r) => r.kind);

describe('règles de rappel', () => {
  it('rien avant l’heure choisie', () => expect(kinds(base(), '2026-03-10', '07:00')).toEqual([]));
  it('rappel quotidien à l’heure, une seule fois', () => {
    expect(kinds(base(), '2026-03-10', '07:31')).toEqual(['daily']);
    expect(kinds(base({ sent: { daily: '2026-03-10' } }), '2026-03-10', '08:00')).toEqual([]);
  });
  it('deuxième rappel seulement si le travail n’est pas fait', () => {
    const s = base({ sent: { daily: '2026-03-10' } });
    expect(kinds(s, '2026-03-10', '19:45')).toEqual(['second']);
    expect(kinds({ ...s, lastActivityDate: '2026-03-10' }, '2026-03-10', '19:45')).toEqual([]);
  });
  it('arrête toute relance dès que l’utilisateur a repris son activité', () => {
    expect(kinds(base({ lastActivityDate: '2026-03-10', unfinishedDate: '2026-03-09' }), '2026-03-10', '23:00')).toEqual([]);
  });
  it('travail inachevé : le lendemain, une seule fois par interruption', () => {
    const s = base({ unfinishedDate: '2026-03-09', sent: { daily: '2026-03-10' }, prefs: { ...DEFAULT_NOTIFICATIONS, daily: { enabled: false, time: '07:30' }, second: { enabled: false, time: '19:30' } } });
    expect(kinds(s, '2026-03-10', '09:30')).toEqual(['unfinished']);
    expect(kinds({ ...s, sent: { unfinished: '2026-03-09' } }, '2026-03-10', '09:30')).toEqual([]);
    expect(kinds(s, '2026-03-09', '23:00')).toEqual([]); // pas le jour même
  });
  it('message de reprise après absence : un seul par absence', () => {
    const s = base({ lastActivityDate: '2026-03-01' });
    expect(kinds(s, '2026-03-10', '10:30')).toEqual(['comeback']);
    expect(kinds({ ...s, sent: { comeback: '2026-03-01' } }, '2026-03-10', '10:30')).toEqual(['daily']);
    expect(kinds(base({ lastActivityDate: '2026-03-08' }), '2026-03-10', '10:30')).toEqual(['daily']); // 2 jours < 3
  });
  it('chaque catégorie peut être désactivée', () => {
    const prefs = structuredClone(DEFAULT_NOTIFICATIONS);
    prefs.daily.enabled = prefs.second.enabled = prefs.unfinished.enabled = prefs.comeback.enabled = false;
    expect(kinds(base({ prefs, lastActivityDate: '2026-02-01', unfinishedDate: '2026-03-01' }), '2026-03-10', '23:00')).toEqual([]);
  });
  it('un nouvel utilisateur (aucune activité) ne reçoit ni reprise ni message culpabilisant', () => {
    expect(kinds(base({ lastActivityDate: null }), '2026-03-10', '12:00')).toEqual(['daily']);
  });
  it('série en jeu : les rappels du jour en parlent (encourageant), sinon message habituel', () => {
    const y = base({ lastActivityDate: '2026-03-09', streak: 5 });
    const daily = decideReminders(y, '2026-03-10', '07:31')[0];
    expect(daily.kind).toBe('daily');
    expect(daily.title).toContain('5 jours');
    const second = decideReminders({ ...y, sent: { daily: '2026-03-10' } }, '2026-03-10', '19:45')[0];
    expect(second.kind).toBe('second');
    expect(second.title).toMatch(/flamme/i);
    expect(second.body).toContain('5 jours');
    // 1 jour : on invite à allumer la série
    expect(decideReminders(base({ streak: 1 }), '2026-03-10', '07:31')[0].title).toMatch(/Allume ta série/);
    // dernière activité plus ancienne : série déjà interrompue, message habituel
    const old = decideReminders(base({ lastActivityDate: '2026-03-07', streak: 5 }), '2026-03-10', '07:31')[0];
    expect(old.title).toBe('Ton Wird du jour');
    // série inconnue : message habituel
    expect(decideReminders(base(), '2026-03-10', '07:31')[0].title).toBe('Ton Wird du jour');
    // jamais de ton culpabilisant
    for (const n of [1, 2, 30]) for (const k of ['daily', 'second'] as const) expect(JSON.stringify(streakMessage(k, n))).not.toMatch(/perdu|échec|dommage|honte|retard/i);
  });
});
