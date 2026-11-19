import { BookOpen, Check, ChevronDown, Flame, Pause, Play, RefreshCw, Undo2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ReviewMoreSheet } from '@/components/ReviewMoreSheet';
import { ConfirmSheet, GradeChip, ProgressBar, Screen, cx, toast } from '@/components/ui';
import { addDays } from '@/engine/dates';
import { formatPages, pageOf } from '@/engine/pages';
import { goalProgress, itemPages, learningEnabled, learningSegment, upcomingRotation } from '@/engine/plan';
import { ayahId, rangeLabel, surahMeta } from '@/engine/quran';
import { groupRuns } from '@/engine/rotation';
import type { PlanItem, WorkKind } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

type Tab = 'today' | 'upcoming' | 'learning';

const KIND: Record<WorkKind, { label: string; chip: string; icon: ReactNode }> = {
  review: { label: 'Révision', chip: 'ic-g', icon: <RefreshCw size={19} /> },
  reinforce: { label: 'Renforcement', chip: 'ic-a', icon: <Flame size={19} /> },
  learn: { label: 'Apprentissage', chip: 'ic-b', icon: <BookOpen size={19} /> },
};

const verses = (it: Pick<PlanItem, 'surah' | 'from' | 'to'>) => rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '');

/**
 * Révisions, en trois temps :
 *  - Aujourd'hui : où j'en suis, ce qu'il reste à faire, ce qui est fait ;
 *  - À venir : ce qui m'attend dans les prochains jours ;
 *  - Apprentissage : les sourates que j'apprends.
 * Aucune notion de retard ni de dette : un élément non fait n'est jamais reporté.
 */
export default function Revisions() {
  const nav = useNavigate();
  const today = useToday();
  const store = useWird();
  const { plan, session, verses: vs, goals, settings, rotation } = store;
  const [tab, setTab] = useState<Tab>('today');
  const [confirm, setConfirm] = useState<{ id: string; kind: 'complete' | 'delete' } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [more, setMore] = useState(false);

  const items = plan?.items ?? [];
  const pending = items.filter((i) => i.status === 'pending');
  const skipped = items.filter((i) => i.status === 'skipped');
  const done = items.filter((i) => i.status === 'done');
  const planned = items.length - skipped.length;
  const ratio = planned ? done.length / planned : 0;

  const begin = (id?: string) => {
    haptic('tap');
    if (store.startSession(id)) nav('/session');
  };

  const upcoming = useMemo(() => {
    const byDate = new Map<string, number[]>();
    for (const k in vs) {
      const v = vs[k];
      if (v.status === 'memorized' && v.fragile && v.reinforceDue && v.reinforceDue > today) byDate.set(v.reinforceDue, [...(byDate.get(v.reinforceDue) ?? []), v.id]);
    }
    const reinforce = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([d, ids]) => groupRuns(ids, 10).map((g) => ({ ...g, due: d })));
    const rot = upcomingRotation({ verses: vs, goals, rotation, settings }, plan, 5);
    return { reinforce: reinforce.slice(0, 6), rot };
  }, [vs, goals, rotation, settings, plan, today]);

  const active = goals.filter((g) => !g.completedAt);
  const finished = goals.filter((g) => g.completedAt);
  const tabs: { v: Tab; l: string; n?: number }[] = [
    { v: 'today', l: 'Aujourd’hui', n: pending.length },
    { v: 'upcoming', l: 'À venir' },
    { v: 'learning', l: 'Apprentissage' },
  ];

  return (
    <>
    <Screen title="Révisions" sub="Ton programme du jour, ce qui arrive et tes apprentissages">
      {/* Où j'en suis */}
      <section className="kpi" aria-label="Avancement du jour">
        <div className="flex items-center gap-4">
          <MiniRing value={ratio} label={planned ? `${done.length}/${planned}` : '0'} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[12px] font-bold uppercase tracking-[1.2px] opacity-70">Aujourd’hui</p>
            <p className="mt-0.5 text-[20px] font-extrabold leading-tight tracking-[-0.3px]">
              {session ? 'Séance en cours' : pending.length ? `${pending.length} passage${pending.length > 1 ? 's' : ''} à faire` : planned ? 'Programme terminé' : 'Rien de prévu'}
            </p>
            <p className="mt-0.5 text-[13px] opacity-75">
              {session ? 'Reprends là où tu t’es arrêté.' : pending.length ? `≈ ${formatPages(pending.reduce((a, i) => a + itemPages(i), 0))} · à ton rythme` : planned ? 'Qu’Allah te facilite, à demain 🌿' : 'Profite de ta journée.'}
            </p>
          </div>
        </div>
        {(session || pending.length > 0) && (
          <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F6F1E4] py-3.5 text-[15.5px] font-bold text-[#12352A] transition active:scale-[.98]" onClick={() => begin()}>
            <Play size={16} fill="currentColor" strokeWidth={0} /> {session ? 'Reprendre ma séance' : 'Commencer ma séance'}
          </button>
        )}
        {!session && Object.values(vs).some((v) => v.status === 'memorized') && (
          <button className={pending.length ? 'mt-3 w-full text-center text-[13.5px] font-semibold underline underline-offset-2 opacity-85' : 'mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F6F1E4] py-3.5 text-[15.5px] font-bold text-[#12352A] transition active:scale-[.98]'} onClick={() => { haptic('tap'); setMore(true); }}>
            {pending.length ? 'Réviser en plus' : 'Réviser davantage'}
          </button>
        )}
      </section>

      <div className="seg mt-4" role="tablist" aria-label="Révisions">
        {tabs.map((t) => (
          <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => { haptic('tap'); setTab(t.v); }}>
            {t.l}{t.n ? <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[12px] tabular-nums">{t.n}</span> : null}
          </button>
        ))}
      </div>

      {/* ---------- Aujourd'hui ---------- */}
      {tab === 'today' && (
        <div className="mt-4">
          {pending.length > 0 ? (
            <ul className="space-y-2.5" aria-label="À faire aujourd’hui">
              {pending.map((it, i) => (
                <Row key={it.id} index={i + 1} it={it} onGo={() => begin(it.id)} onSkip={() => { store.skipItem(it.id); toast('Mis de côté pour aujourd’hui'); }} />
              ))}
            </ul>
          ) : (
            <div className="card px-5 py-7 text-center">
              <p className="text-lg font-bold">{planned ? 'Tout est fait 🌿' : 'Rien de prévu aujourd’hui'}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{planned ? 'Ton programme du jour est terminé. Tu peux encore choisir une sourate dans Mon Wird si tu veux continuer.' : 'Choisis une sourate à apprendre dans Mon Wird, ou ajuste ton rythme dans Profil.'}</p>
              <Link to="/wird" className="btn-soft mt-4 !min-h-[40px] text-sm">Ouvrir Mon Wird</Link>
            </div>
          )}

          {skipped.length > 0 && (
            <>
              <h2 className="label mb-2 mt-6">Mis de côté ({skipped.length})</h2>
              <ul className="space-y-2">
                {skipped.map((it) => (
                  <li key={it.id} className="card flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(it.surah).tr}</b><span className="text-sm text-muted">{verses(it)}</span></div>
                    <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => { store.reopenItem(it.id); haptic('tap'); }}><Undo2 size={15} /> Remettre</button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {done.length > 0 && (
            <>
              <button className="mt-6 flex w-full items-center justify-between" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                <h2 className="label">Fait aujourd’hui ({done.length})</h2>
                <ChevronDown size={18} className={cx('text-muted transition', showDone && 'rotate-180')} />
              </button>
              {showDone && (
                <ul className="mt-2 space-y-2">
                  {done.map((it) => (
                    <li key={it.id} className="card flex items-center gap-3 p-3.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-good text-white"><Check size={15} strokeWidth={3} /></span>
                      <div className="min-w-0 flex-1"><b className="block truncate">{surahMeta(it.surah).tr}</b><span className="text-sm text-muted">{verses(it)}</span></div>
                      {it.grade && <GradeChip grade={it.grade} />}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="mt-6 flex justify-center gap-5 text-sm font-semibold text-primary">
            <button onClick={() => { store.refreshPlan(); haptic('tap'); toast('Programme actualisé'); }}>Actualiser mon programme</button>
            <Link to="/apprendre">Choisir quoi apprendre</Link>
          </div>
          <p className="mt-2 text-center text-xs leading-relaxed text-muted">« Actualiser » remet à jour les passages qu’il te reste à faire aujourd’hui. Rien n’est jamais dû : ce qui n’est pas fait n’est pas reporté.</p>
        </div>
      )}

      {/* ---------- À venir ---------- */}
      {tab === 'upcoming' && (
        <div className="mt-4">
          {upcoming.reinforce.length + upcoming.rot.length === 0 ? (
            <div className="card px-5 py-7 text-center"><p className="text-lg font-bold">Rien de prévu pour le moment 🌿</p><p className="mx-auto mt-1 max-w-xs text-sm text-muted">Les prochains passages apparaîtront ici dès que tu auras des versets à réviser.</p></div>
          ) : (
            <>
              <ul className="card divide-y divide-line overflow-hidden">
                {upcoming.reinforce.map((g) => (
                  <li key={`${g.due}-${g.surah}-${g.from}`} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="chip-ic ic-a !h-10 !w-10 !rounded-xl"><Flame size={18} /></span>
                    <div className="min-w-0 flex-1"><b className="block truncate text-[15px]">{surahMeta(g.surah).tr}</b><span className="text-[13px] text-muted">{rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')} · renforcement</span></div>
                    <span className="whitespace-nowrap rounded-full bg-hard-soft px-3 py-1 text-xs font-bold text-hard">{g.due === addDays(today, 1) ? 'Demain' : formatDateShort(g.due)}</span>
                  </li>
                ))}
                {upcoming.rot.map((g) => (
                  <li key={`r-${g.surah}-${g.from}`} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="chip-ic ic-g !h-10 !w-10 !rounded-xl"><RefreshCw size={18} /></span>
                    <div className="min-w-0 flex-1"><b className="block truncate text-[15px]">{surahMeta(g.surah).tr}</b><span className="text-[13px] text-muted">{rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')} · révision</span></div>
                    <span className="whitespace-nowrap rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted">≈ dans {g.inDays} j</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-muted">Ce sont des estimations, pas des échéances : seules les dates de renforcement sont certaines.</p>
            </>
          )}
        </div>
      )}

      {/* ---------- Apprentissage ---------- */}
      {tab === 'learning' && (
        <div className="mt-4">
          <p className="card px-4 py-3 text-sm leading-relaxed text-muted">
            {learningEnabled(settings) ? <>Ton rythme : <b className="text-ink">{settings.learnWeekly ? (settings.learnWeekly.unit === 'verses' ? `${settings.learnWeekly.amount} verset${settings.learnWeekly.amount > 1 ? 's' : ''} par semaine` : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(settings.learnWeekly.amount)} page${settings.learnWeekly.amount > 1 ? 's' : ''} par semaine`) : 'rythme personnalisé'}</b>, {settings.learnDirection === 'forward' ? 'du début du Coran' : 'de la fin du Coran'}. </> : 'Pas de nouvel apprentissage. '}
            <Link to="/profil/parametres/memorisation" className="font-semibold text-primary">Modifier</Link>
          </p>
          <div className="mt-3 space-y-2.5">
            {active.length === 0 && <p className="card p-5 text-center text-sm text-muted">{learningEnabled(settings) ? 'WIRD ouvrira automatiquement la prochaine sourate à apprendre.' : 'Aucun apprentissage en cours. Ajoutes-en un ci-dessous.'}</p>}
            {active.map((g) => {
              const s = surahMeta(g.surah);
              const p = goalProgress(g);
              const seg = learningSegment({ verses: vs }, g);
              const complete = p.done >= p.total || !seg;
              return (
                <article key={g.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-[17px]">{s.id}. {s.tr} {g.auto && <span className="ml-1 rounded-full bg-blue-soft px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-blue">Auto</span>}</b>
                    {g.paused ? <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-xs text-muted">En pause</span> : <span className="rounded-full bg-blue px-2.5 py-0.5 text-xs text-white">En cours</span>}
                  </div>
                  <p className="text-sm text-muted">{rangeLabel(g.surah, g.from, g.to)}</p>
                  <div className="my-2.5"><ProgressBar value={p.total ? p.done / p.total : 0} tone="blue" /></div>
                  <p className="text-sm text-muted">{p.done} / {p.total} versets appris{seg ? ` · prochain : ${seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${seg.to}`}` : ''}</p>
                  {!g.paused && seg && <button className="btn-primary mt-3 w-full" onClick={() => { haptic('tap'); if (store.startLearnAhead(g.id)) nav('/session'); }}><Play size={16} fill="currentColor" strokeWidth={0} /> Apprendre la suite · {seg.from === seg.to ? `verset ${seg.from}` : `versets ${seg.from} à ${Math.min(seg.to, seg.from + 4)}`}</button>}
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
          <button className="btn-outline mt-3 w-full" onClick={() => nav('/apprendre')}>+ Choisir moi-même une sourate ou des versets</button>
          {finished.length > 0 && (
            <>
              <h2 className="label mb-2.5 mt-7">Apprentissages terminés ({finished.length})</h2>
              <ul className="card divide-y divide-line">
                {finished.map((g) => (
                  <li key={g.id}><Link to={`/wird/${g.surah}`} className="flex items-center gap-3 px-4 py-3 text-sm"><Check size={16} className="text-good" /><span className="flex-1"><b>{surahMeta(g.surah).tr}</b> <span className="text-muted">· {rangeLabel(g.surah, g.from, g.to).replace(/^Sourate \d+ — /, '')}</span></span></Link></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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
    <ReviewMoreSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}

/** Une ligne du programme : sourate et versets en haut, type de travail et action principale en bas. */
function Row({ it, index, onGo, onSkip }: { it: PlanItem; index: number; onGo: () => void; onSkip: () => void }) {
  const k = KIND[it.kind];
  const s = surahMeta(it.surah);
  return (
    <li className="card p-3.5">
      <div className="flex items-start gap-3">
        <span className="num-tile" aria-hidden>{String(index).padStart(2, '0')}</span>
        <Link to={`/wird/${it.surah}`} className="min-w-0 flex-1">
          <b className="block text-[16px] leading-snug">{s.id}. {s.tr}</b>
          <span className="block text-[13px] leading-snug text-muted">{verses(it)} · {it.kind === 'review' ? `page ${pageOf(ayahId(it.surah, it.from))}` : formatPages(itemPages(it))}</span>
        </Link>
        <button className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface2" aria-label="Mettre de côté pour aujourd’hui" onClick={onSkip}>⋯</button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold', k.chip)}><span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{k.icon}</span>{k.label}</span>
        <button className="rounded-full bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-ink transition active:scale-95" onClick={onGo}>Commencer</button>
      </div>
    </li>
  );
}

function MiniRing({ value, label }: { value: number; label: string }) {
  const size = 76;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Avancement ${Math.round(value * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,.16)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="rgb(var(--ring))" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[15px] font-extrabold tabular-nums">{label}</div>
    </div>
  );
}
