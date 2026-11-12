import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { FastScroll } from '@/components/FastScroll';
import { SurahNumber, cx } from '@/components/ui';
import { matchSurah } from '@/components/SurahPickerList';
import { nextLearnTarget } from '@/engine/plan';
import { formatPages, rangePages } from '@/engine/pages';
import { SURAHS, surahMeta } from '@/engine/quran';
import { newMemorizedVerse } from '@/engine/scheduling';
import { ayahId } from '@/engine/quran';
import type { Direction, VerseState } from '@/engine/types';
import { DEFAULT_SETTINGS } from '@/engine/config';
import { useWird } from '@/store/useWird';

const STEPS = 6; // 0 bienvenue · 1 sourates · 2 apprentissage · 3 révision · 4 programme · 5 récapitulatif
const surahPages = (id: number) => rangePages(id, 1, surahMeta(id).n);

export default function Onboarding() {
  const complete = useWird((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [learnDir, setLearnDir] = useState<Direction>('forward');
  const [reviewDir, setReviewDir] = useState<Direction>('forward');
  const [learnPages, setLearnPages] = useState(DEFAULT_SETTINGS.learnPagesPerDay);
  const [reviewPages, setReviewPages] = useState(DEFAULT_SETTINGS.reviewPagesPerDay);

  const knownPages = useMemo(() => [...known].reduce((a, id) => a + surahPages(id), 0), [known]);
  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const finish = (demo = false) => complete({ name, knownSurahs: [...known], learnDirection: learnDir, reviewDirection: reviewDir, learnPagesPerDay: learnPages, reviewPagesPerDay: reviewPages, demo });

  if (step === 0) return <Welcome name={name} setName={setName} onStart={next} onDemo={() => complete({ name, knownSurahs: [], learnDirection: 'forward', reviewDirection: 'forward', learnPagesPerDay: 0.5, reviewPagesPerDay: 2, demo: true })} />;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="pt-safe sticky top-0 z-20 bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[520px] items-center gap-3 px-4 py-3">
          <button onClick={back} className="-ml-1 flex min-h-[40px] items-center gap-0.5 pr-2 font-semibold text-primary">
            <ArrowLeft size={18} /> Retour
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2" aria-label={`Étape ${step} sur ${STEPS - 1}`}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(step / (STEPS - 1)) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted">{step}/{STEPS - 1}</span>
        </div>
      </header>

      {step === 1 && <KnownStep known={known} setKnown={setKnown} knownPages={knownPages} onNext={next} />}
      {step === 2 && <DirectionStep key="learn" title="Dans quel sens apprendre de nouvelles sourates ?" hint="WIRD vous proposera la prochaine sourate à apprendre dans cet ordre, parmi celles que vous ne connaissez pas encore." value={learnDir} onChange={setLearnDir} known={known} showNext onNext={next} />}
      {step === 3 && <DirectionStep key="review" title="Dans quel sens réviser vos sourates apprises ?" hint="Votre révision parcourt en continu ce que vous connaissez. Ce sens est indépendant de celui de l’apprentissage." value={reviewDir} onChange={setReviewDir} known={known} onNext={next} />}
      {step === 4 && <ProgramStep learnPages={learnPages} reviewPages={reviewPages} setLearn={setLearnPages} setReview={setReviewPages} known={known} knownPages={knownPages} learnDir={learnDir} onNext={next} />}
      {step === 5 && <Recap known={known} knownPages={knownPages} learnDir={learnDir} reviewDir={reviewDir} learnPages={learnPages} reviewPages={reviewPages} goTo={setStep} onFinish={() => finish()} />}
    </div>
  );
}

// ------------------------------------------------------------------ 1 · Bienvenue
function Welcome({ name, setName, onStart, onDemo }: { name: string; setName: (s: string) => void; onStart: () => void; onDemo: () => void }) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <img src="/icons/icon-192.png" alt="" className="h-[116px] w-[116px] rounded-[27px] shadow-[0_10px_30px_rgba(31,77,58,.22)]" />
        <h1 className="mt-7 font-display text-[30px] font-semibold leading-tight tracking-[-0.2px]">Bienvenue dans WIRD</h1>
        <p className="mt-2 font-display text-[19px] text-primary">Mémorisez. Révisez. Progressez.</p>
        <p className="mt-3 max-w-[330px] text-[15px] leading-relaxed text-muted">WIRD vous accompagne chaque jour dans l’apprentissage et la révision du Coran, à votre rythme et sans pression : une rotation continue, un renforcement doux de ce qui est fragile, jamais de culpabilité.</p>
        <label className="mt-7 block w-full text-left">
          <span className="label">Votre prénom (facultatif)</span>
          <input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pour une salutation personnalisée" autoComplete="given-name" maxLength={40} />
        </label>
      </div>
      <div className="mx-auto w-full max-w-[520px] px-4 pb-6">
        <button onClick={onStart} className="btn-primary w-full">
          Commencer <ArrowRight size={18} />
        </button>
        <button onClick={onDemo} className="mt-1 w-full py-3 text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Découvrir avec des données de démonstration
        </button>
        <p className="text-center text-xs text-muted">Sans compte · vos données restent sur cet appareil</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 2 · Sourates déjà apprises
function KnownStep({ known, setKnown, knownPages, onNext }: { known: Set<number>; setKnown: (s: Set<number>) => void; knownPages: number; onNext: () => void }) {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const list = useMemo(() => SURAHS.filter((s) => matchSurah(s, q)), [q]);
  const toggle = (id: number) => {
    const n = new Set(known);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setKnown(n);
  };
  const setMany = (ids: number[], on: boolean) => {
    const n = new Set(known);
    ids.forEach((i) => (on ? n.add(i) : n.delete(i)));
    setKnown(n);
  };
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const f = Math.max(1, Math.min(114, parseInt(from) || 0));
  const t = Math.max(1, Math.min(114, parseInt(to) || 0));

  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">Quelles sourates connaissez-vous déjà ?</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Cochez celles que vous avez apprises. Elles entreront dans votre révision : « connue » ne veut pas dire « plus besoin de réviser ». Vous pourrez préciser verset par verset plus tard.</p>
        <input className="input mt-4" placeholder="Rechercher (nom, numéro, arabe)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip onClick={() => setMany(range(1, 114), true)}>Tout cocher</Chip>
          <Chip onClick={() => setKnown(new Set())}>Tout décocher</Chip>
          <Chip onClick={() => setMany(range(78, 114), true)}>Juz ʿAmma (78–114)</Chip>
          <Chip onClick={() => setMany(list.map((s) => s.id), true)}>Cocher la recherche</Chip>
        </div>
        <div className="card mt-3 flex items-center gap-2 px-3 py-2 text-sm">
          <span className="text-muted">Cocher de la sourate</span>
          <input inputMode="numeric" className="h-9 w-14 rounded-md border border-line bg-bg text-center" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} aria-label="De la sourate" />
          <span className="text-muted">à</span>
          <input inputMode="numeric" className="h-9 w-14 rounded-md border border-line bg-bg text-center" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} aria-label="À la sourate" />
          <button className="ml-auto rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink disabled:opacity-40" disabled={!from || !to} onClick={() => setMany(range(Math.min(f, t), Math.max(f, t)), true)}>
            Cocher
          </button>
        </div>
        <ul ref={listRef} className="card mt-4 divide-y divide-line overflow-hidden">
          {list.map((s) => {
            const on = known.has(s.id);
            return (
              <li key={s.id}>
                <button role="checkbox" aria-checked={on} onClick={() => toggle(s.id)} className={cx('flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-surface2', on && 'bg-good-soft/60')}>
                  <SurahNumber n={s.id} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{s.tr}</span>
                    <span className="block text-xs text-muted">{s.fr} · {s.n} versets</span>
                  </span>
                  <span className="ar mr-1 text-xl leading-none" lang="ar">{s.ar}</span>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition', on ? 'border-good bg-good text-white' : 'border-line')}>{on && <Check size={15} strokeWidth={3} />}</span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="p-8 text-center text-sm text-muted">Aucune sourate trouvée.</li>}
        </ul>
      </div>
      <FastScroll targetRef={listRef} count={list.length} label={(i) => `${list[i]?.id}. ${list[i]?.tr}`} top={72} bottom={120} />
      <Footer>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span><b className="tabular-nums">{known.size}</b> <span className="text-muted">/ 114 sourates</span></span>
          <span className="text-muted">≈ {formatPages(knownPages)}</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(known.size / 114) * 100}%` }} /></div>
        <button className="btn-primary w-full" onClick={onNext}>{known.size ? 'Continuer' : 'Je n’en connais pas encore'}</button>
      </Footer>
    </>
  );
}

const Chip = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="chip">{children}</button>
);

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-[520px] px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ 3 & 4 · Sens
function DirectionStep({ title, hint, value, onChange, known, showNext, onNext }: { title: string; hint: string; value: Direction; onChange: (d: Direction) => void; known: Set<number>; showNext?: boolean; onNext: () => void }) {
  const opts: { v: Direction; label: string; sub: string }[] = [
    { v: 'forward', label: 'De Al-Fatiha vers An-Nas', sub: 'Sourate 1 → sourate 114' },
    { v: 'backward', label: 'De An-Nas vers Al-Fatiha', sub: 'Sourate 114 → sourate 1' },
  ];
  const target = useMemo(() => {
    if (!showNext) return null;
    const verses: Record<number, VerseState> = {};
    for (const id of known) for (let a = 1; a <= surahMeta(id).n; a++) verses[ayahId(id, a)] = newMemorizedVerse(ayahId(id, a), '2000-01-01');
    return nextLearnTarget(verses, [], value);
  }, [known, value, showNext]);
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>
        <div className="mt-6 space-y-3" role="radiogroup">
          {opts.map((o) => (
            <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={cx('flex w-full items-center gap-4 rounded-[14px] border-2 bg-surface p-4 text-left transition', value === o.v ? 'border-primary' : 'border-line')}>
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', value === o.v ? 'border-primary bg-primary text-primary-ink' : 'border-line')}>{value === o.v && <Check size={14} strokeWidth={3} />}</span>
              <span className="flex-1">
                <span className="block font-display text-[18px] font-semibold">{o.label}</span>
                <span className="block text-sm text-muted">{o.sub}</span>
              </span>
              <span className="font-display text-2xl text-primary" aria-hidden>{o.v === 'forward' ? '→' : '←'}</span>
            </button>
          ))}
        </div>
        {showNext && (
          <p className="card mt-5 px-4 py-3 text-sm leading-relaxed">
            {target ? (<>Prochaine sourate proposée : <b>{target.surah}. {surahMeta(target.surah).tr}</b>{target.from > 1 ? ` (à partir du verset ${target.from})` : ''}.</>) : 'Vous avez coché tout le Coran : il n’y a plus de nouvelle sourate à apprendre.'}
          </p>
        )}
      </div>
      <Footer><button className="btn-primary w-full" onClick={onNext}>Continuer</button></Footer>
    </>
  );
}

// ------------------------------------------------------------------ 5 · Programme quotidien
export function PagesStepper({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Math.round(n * 2) / 2)));
  return (
    <div className="flex items-center gap-2">
      <button aria-label={`Moins de pages ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value <= min} onClick={() => set(value - 0.5)}><Minus size={18} /></button>
      <div className="w-[88px] text-center">
        <p className="font-display text-[30px] font-semibold leading-none tabular-nums">{new Intl.NumberFormat('fr-FR').format(value)}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-muted">{value > 1 ? 'pages' : 'page'}</p>
      </div>
      <button aria-label={`Plus de pages ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value >= max} onClick={() => set(value + 0.5)}><Plus size={18} /></button>
    </div>
  );
}

function ProgramStep({ learnPages, reviewPages, setLearn, setReview, known, knownPages, learnDir, onNext }: { learnPages: number; reviewPages: number; setLearn: (n: number) => void; setReview: (n: number) => void; known: Set<number>; knownPages: number; learnDir: Direction; onNext: () => void }) {
  void learnDir;
  const allKnown = known.size === 114;
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">Votre programme quotidien</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Combien de pages du Mushaf souhaitez-vous apprendre et réviser chaque jour ? C’est un objectif, jamais une dette. Vous pourrez le modifier à tout moment dans Profil.</p>
        <section className="mt-6 card p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-display text-lg font-semibold">À apprendre</p><p className="text-xs text-muted">0 pour ne pas apprendre de nouveau</p></div>
            <PagesStepper value={learnPages} onChange={setLearn} min={0} max={5} label="à apprendre" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{allKnown ? 'Vous avez coché tout le Coran : rien de nouveau à apprendre.' : learnPages === 0 ? 'Aucun nouvel apprentissage ne sera proposé.' : 'Les nouvelles sourates sont proposées dans le sens choisi, par plages de versets.'}</p>
        </section>
        <section className="mt-3 card p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-display text-lg font-semibold">À réviser</p><p className="text-xs text-muted">Rotation de vos sourates apprises</p></div>
            <PagesStepper value={reviewPages} onChange={setReview} min={0} max={20} label="à réviser" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {known.size === 0 ? 'Aucune sourate apprise pour l’instant : la révision démarrera dès que vous aurez du contenu à réviser.' : reviewPages > knownPages ? `Vous connaissez environ ${formatPages(knownPages)} : la révision s’adaptera à ce contenu, sans rien inventer.` : `Vous connaissez environ ${formatPages(knownPages)} : un tour complet prendra environ ${Math.max(1, Math.ceil(knownPages / Math.max(0.5, reviewPages)))} jour(s).`}
          </p>
        </section>
        <p className="mt-4 text-xs leading-relaxed text-muted">1 page = une page du Mushaf de Médine (604 pages). Le programme s’adapte à votre progression réelle ; une journée manquée ne crée aucun retard.</p>
      </div>
      <Footer><button className="btn-primary w-full" onClick={onNext}>Continuer</button></Footer>
    </>
  );
}

// ------------------------------------------------------------------ 6 · Récapitulatif
function Recap({ known, knownPages, learnDir, reviewDir, learnPages, reviewPages, goTo, onFinish }: { known: Set<number>; knownPages: number; learnDir: Direction; reviewDir: Direction; learnPages: number; reviewPages: number; goTo: (s: number) => void; onFinish: () => void }) {
  const dir = (d: Direction) => (d === 'forward' ? 'Al-Fatiha → An-Nas' : 'An-Nas → Al-Fatiha');
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Sourates déjà apprises', value: known.size ? `${known.size} sourate${known.size > 1 ? 's' : ''} · ≈ ${formatPages(knownPages)}` : 'Aucune pour l’instant', step: 1 },
    { label: 'Sens d’apprentissage', value: dir(learnDir), step: 2 },
    { label: 'Sens de révision', value: dir(reviewDir), step: 3 },
    { label: 'Programme quotidien', value: `${learnPages ? formatPages(learnPages) : 'Pas d’apprentissage'} à apprendre · ${reviewPages ? formatPages(reviewPages) : 'pas de révision'} à réviser`, step: 4 },
  ];
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">Tout est prêt</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Voici votre configuration. Elle est enregistrée sur cet appareil et modifiable à tout moment depuis Profil › Paramètres du Wird.</p>
        <ul className="card mt-6 divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1"><p className="label">{r.label}</p><p className="mt-1 text-[15px] font-semibold">{r.value}</p></div>
              <button onClick={() => goTo(r.step)} className="text-sm font-semibold text-primary">Modifier</button>
            </li>
          ))}
        </ul>
      </div>
      <Footer><button className="btn-primary w-full" onClick={onFinish}>Commencer à utiliser WIRD</button></Footer>
    </>
  );
}
