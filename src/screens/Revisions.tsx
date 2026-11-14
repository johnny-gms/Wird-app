import { Check, Pause, Play, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddLearningSheet } from '@/components/AddLearningSheet';
import { ConfirmSheet, GradeChip, ProgressBar, Screen, cx, toast } from '@/components/ui';
import { addDays } from '@/engine/dates';
import { formatPages, pageOf } from '@/engine/pages';
import { goalProgress, itemPages, learningEnabled, learningSegment, upcomingRotation } from '@/engine/plan';
import { ayahId, rangeLabel, surahMeta } from '@/engine/quran';
import { groupRuns } from '@/engine/rotation';
import type { PlanItem } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

const H2 = ({ children, n }: { children: React.ReactNode; n?: number }) => (
  <h2 className="label mb-2.5 mt-[30px]">{children}{n !== undefined ? ` (${n})` : ''}</h2>
);

/**
 * Révisions : tout le travail du jour (rotation, renforcement, nouvel apprentissage), les activités inachevées,
 * ce qui est fait, et ce qui vient. Aucune notion de retard ni de dette : un élément non fait n'est jamais reporté.
 */
export default function Revisions() {
  const nav = useNavigate();
  const today = useToday();
  const store = useWird();
  const { plan, session, verses, goals, settings, rotation } = store;
  const items = plan?.items ?? [];
  const pending = items.filter((i) => i.status === 'pending');
  const skipped = items.filter((i) => i.status === 'skipped');
  const done = items.filter((i) => i.status === 'done');
  const [add, setAdd] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'complete' | 'delete' } | null>(null);

  const begin = (id?: string) => {
    haptic('tap');
    if (store.startSession(id)) nav('/session');
  };

  // À venir : renforcements datés (réels) + estimation de la rotation (indicative)
  const upcoming = useMemo(() => {
    const byDate = new Map<string, number[]>();
    for (const k in verses) {
      const v = verses[k];
      if (v.status === 'memorized' && v.fragile && v.reinforceDue && v.reinforceDue > today) byDate.set(v.reinforceDue, [...(byDate.get(v.reinforceDue) ?? []), v.id]);
    }
    const reinforce = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([d, ids]) => groupRuns(ids, 10).map((g) => ({ ...g, due: d })));
    const rot = upcomingRotation({ verses, goals, rotation, settings }, plan, 5);
    return { reinforce: reinforce.slice(0, 6), rot };
  }, [verses, goals, rotation, settings, plan, today]);

  const active = goals.filter((g) => !g.completedAt);
  const finished = goals.filter((g) => g.completedAt);

  return (
    <Screen title="Mes révisions" sub="Révisions">
      <p className="-mt-1 text-sm text-muted">Les versets que tu as déjà appris : on les garde au chaud. Rien n’est jamais dû : ce qui n’est pas fait aujourd’hui n’est pas reporté.</p>

      {/* Activités inachevées */}
      {(session || skipped.length > 0) && (
        <section>
          <H2 n={(session ? 1 : 0) + skipped.length}>Activités inachevées</H2>
          {session && (
            <button onClick={() => begin()} className="card flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-primary"><Play size={16} /></span>
              <span className="flex-1"><b className="block">Séance en cours</b><span className="text-sm text-muted">{session.step === 'evaluate' ? 'Évaluation à terminer' : `${pending.length} élément${pending.length > 1 ? 's' : ''} au programme`} · reprise là où tu t’es arrêté</span></span>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-ink">Reprendre</span>
            </button>
          )}
          {skipped.map((it) => (
            <div key={it.id} className="card mt-2 flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(it.surah).tr}</b><span className="text-sm text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · ignoré aujourd’hui</span></div>
              <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => { store.reopenItem(it.id); haptic('tap'); }}><Undo2 size={15} /> Remettre</button>
            </div>
          ))}
        </section>
      )}

      {pending.length > 0 && !session && <button className="btn-primary mt-4 w-full" onClick={() => begin()}><Play size={18} /> Commencer ma séance</button>}

      <Section title="Aujourd’hui" items={pending.filter((i) => i.kind === 'review')} empty="Rien ici 🌿" onGo={begin} onSkip={(id) => { store.skipItem(id); toast('Ignoré pour aujourd’hui'); }} />
      <Section title="Renforcement" hint="Versets fragiles : ils restent dans la rotation et reviennent plus tôt, jusqu’à se stabiliser." items={pending.filter((i) => i.kind === 'reinforce')} empty="Rien ici 🌿" onGo={begin} onSkip={(id) => store.skipItem(id)} />
      <Section title="Nouvel apprentissage" items={pending.filter((i) => i.kind === 'learn')} empty={learningEnabled(settings) ? 'Rien ici 🌿' : 'Aucun nouvel apprentissage proposé (0 page par semaine).'} onGo={begin} onSkip={(id) => store.skipItem(id)} />

      {done.length > 0 && (
        <>
          <H2 n={done.length}>Faites aujourd’hui</H2>
          <div className="space-y-2">
            {done.map((it) => (
              <div key={it.id} className="card flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(it.surah).tr}</b><span className="text-sm text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')}</span></div>
                {it.grade ? <GradeChip grade={it.grade} /> : <span className="text-sm font-semibold text-good">Fait ✓</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* À venir */}
      <H2 n={upcoming.reinforce.length + upcoming.rot.length}>À venir</H2>
      {upcoming.reinforce.length + upcoming.rot.length === 0 ? <p className="text-sm text-muted">Rien de prévu pour le moment 🌿</p> : (
        <div className="space-y-2">
          {upcoming.reinforce.map((g) => (
            <div key={`${g.due}-${g.surah}-${g.from}`} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(g.surah).tr}</b><span className="text-sm text-muted">{rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')} · renforcement</span></div>
              <span className="whitespace-nowrap rounded-full bg-hard px-2.5 py-0.5 text-xs text-white">{g.due === addDays(today, 1) ? 'Demain' : formatDateShort(g.due)}</span>
            </div>
          ))}
          {upcoming.rot.map((g) => (
            <div key={`r-${g.surah}-${g.from}`} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(g.surah).tr}</b><span className="text-sm text-muted">{rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')} · rotation (estimation)</span></div>
              <span className="whitespace-nowrap rounded-full bg-surface2 px-2.5 py-0.5 text-xs text-muted">≈ dans {g.inDays} j</span>
            </div>
          ))}
          <p className="text-xs text-muted">Les dates de renforcement sont réelles. Pour la rotation, c’est une estimation selon ton objectif en pages : ce n’est pas un calendrier à respecter.</p>
        </div>
      )}

      {/* Mon apprentissage */}
      <h1 className="mt-10 font-display text-[26px] font-semibold tracking-[-0.2px]">Mon apprentissage</h1>
      <p className="text-sm text-muted">Les versets que tu <b>apprends encore</b>, pas encore solides.</p>
      <p className="card mt-3 px-4 py-3 text-sm leading-relaxed text-muted">
        {learningEnabled(settings) ? <>Repère : <b className="text-ink">{settings.learnMode === 'surah' ? 'une sourate par semaine' : `${formatPages(settings.learnPagesPerWeek)} par semaine`}</b>, nouvelles sourates {settings.learnDirection === 'forward' ? 'de Al-Fatiha vers An-Nas' : 'de An-Nas vers Al-Fatiha'}. </> : 'Pas d’objectif d’apprentissage (0 page par semaine). '}
        <Link to="/profil" className="font-semibold text-primary">Modifier</Link>
      </p>
      <div className="mt-3 space-y-2.5">
        {active.length === 0 && <p className="card p-5 text-center text-sm text-muted">{learningEnabled(settings) ? 'WIRD ouvrira automatiquement la prochaine sourate à apprendre.' : 'Aucun apprentissage en cours. Ajoutes-en un ci-dessous.'}</p>}
        {active.map((g) => {
          const s = surahMeta(g.surah);
          const p = goalProgress(g);
          const seg = learningSegment({ verses }, g);
          const complete = p.done >= p.total || !seg;
          return (
            <article key={g.id} className="card border-l-4 border-l-blue p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate">{s.id}. {s.tr} {g.auto && <span className="ml-1 rounded-full bg-blue-soft px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-blue">Auto</span>}</b>
                {g.paused ? <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-xs text-muted">En pause</span> : <span className="rounded-full bg-blue px-2.5 py-0.5 text-xs text-white">En cours</span>}
              </div>
              <p className="text-sm text-muted">{rangeLabel(g.surah, g.from, g.to)}</p>
              <div className="my-2.5"><ProgressBar value={p.total ? p.done / p.total : 0} tone="blue" /></div>
              <p className="text-sm text-muted">{p.done} / {p.total} versets travaillés{seg ? ` · prochain : ${seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${seg.to}`}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!g.auto && <button className={cx(complete ? 'btn-primary' : 'btn-soft', '!min-h-[40px] flex-1 text-sm')} onClick={() => setConfirm({ id: g.id, kind: 'complete' })}><Check size={16} /> Marquer comme terminé</button>}
                {g.auto && <p className="flex-1 self-center text-xs leading-relaxed text-muted">Se termine automatiquement quand tous les versets ont été travaillés.</p>}
                <button className="btn-outline !min-h-[40px]" onClick={() => store.toggleGoalPause(g.id)} aria-label={g.paused ? 'Reprendre cet apprentissage' : 'Mettre en pause'}>{g.paused ? <Play size={16} /> : <Pause size={16} />}</button>
                {!g.auto && <button className="btn-ghost !min-h-[40px] text-alert" onClick={() => setConfirm({ id: g.id, kind: 'delete' })}>Retirer</button>}
              </div>
            </article>
          );
        })}
      </div>
      <button className="btn-outline mt-3 w-full" onClick={() => setAdd(true)}>+ Choisir moi-même une sourate ou des versets</button>
      {finished.length > 0 && (
        <>
          <H2 n={finished.length}>Apprentissages terminés</H2>
          <ul className="card divide-y divide-line">
            {finished.map((g) => (
              <li key={g.id}><Link to={`/wird/${g.surah}`} className="flex items-center gap-3 px-4 py-3 text-sm"><Check size={16} className="text-good" /><span className="flex-1"><b>{surahMeta(g.surah).tr}</b> <span className="text-muted">· {rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')}</span></span></Link></li>
            ))}
          </ul>
        </>
      )}
      <AddLearningSheet open={add} onClose={() => setAdd(false)} />
      <ConfirmSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'complete' ? 'Marquer comme terminé ?' : 'Retirer cet apprentissage ?'}
        message={confirm?.kind === 'complete' ? 'Ces versets entrent dans ta rotation de révision et te seront proposés en confirmation dès demain.' : 'Les versets encore en apprentissage ne seront plus suivis (ils vont dans la corbeille pendant 30 jours). Les versets déjà appris restent dans ta rotation.'}
        confirmLabel={confirm?.kind === 'complete' ? 'Oui, terminé' : 'Retirer'}
        danger={confirm?.kind === 'delete'}
        onConfirm={() => {
          if (!confirm) return;
          haptic('success');
          if (confirm.kind === 'complete') { store.completeGoal(confirm.id); toast('Apprentissage terminé — bravo'); } else { store.deleteGoal(confirm.id); toast('Retiré (corbeille 30 jours)'); }
        }}
      />
    </Screen>
  );
}

function Section({ title, hint, items, empty, onGo, onSkip }: { title: string; hint?: string; items: PlanItem[]; empty: string; onGo: (id: string) => void; onSkip: (id: string) => void }) {
  return (
    <>
      <H2 n={items.length}>{title}</H2>
      {hint && <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p>}
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <div className="space-y-2">
          {items.map((it) => {
            const s = surahMeta(it.surah);
            return (
              <div key={it.id} className={cx('card flex items-center gap-3 border-l-4 p-3.5', it.kind === 'learn' ? 'border-l-blue' : it.kind === 'reinforce' ? 'border-l-hard' : 'border-l-good')}>
                <Link to={`/wird/${it.surah}`} className="min-w-0 flex-1">
                  <b className="block truncate">{s.id}. {s.tr}</b>
                  <span className="text-sm text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · {it.kind === 'review' ? `page ${pageOf(ayahId(it.surah, it.from))}` : formatPages(itemPages(it))}</span>
                </Link>
                <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => onGo(it.id)}>Commencer</button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2" aria-label="Passer cet élément" onClick={() => onSkip(it.id)}>⋯</button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

