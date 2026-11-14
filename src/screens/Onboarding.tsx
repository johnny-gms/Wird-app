import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { KnownPicker } from '@/components/KnownPicker';
import { StickyFooter, cx } from '@/components/ui';
import { DEFAULT_SETTINGS } from '@/engine/config';
import { formatPages, rangePages } from '@/engine/pages';
import { nextLearnTarget } from '@/engine/plan';
import { ayahId, surahMeta } from '@/engine/quran';
import { newMemorizedVerse } from '@/engine/scheduling';
import type { Direction, LearnMode, VerseState } from '@/engine/types';
import { loadQuranText } from '@/lib/quranText';
import { accountAvailable, authenticate } from '@/sync/account';
import { useWird } from '@/store/useWird';

// 0-2 présentation · 3 compte · 4 prénom · 5 sourates connues · 6 apprentissage · 7 révision · 8 récapitulatif
const INTRO = 3;
const ACCOUNT = 3;
const NAME = 4;
const KNOWN = 5;
const LEARN = 6;
const REVIEW = 7;
const RECAP = 8;
const SETUP_FIRST = NAME;
const SETUP_COUNT = RECAP - NAME + 1;
const surahPages = (id: number) => rangePages(id, 1, surahMeta(id).n);

export default function Onboarding() {
  const complete = useWird((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [learnDir, setLearnDir] = useState<Direction>('forward');
  const [learnMode, setLearnMode] = useState<LearnMode>(DEFAULT_SETTINGS.learnMode);
  const [learnPages, setLearnPages] = useState(DEFAULT_SETTINGS.learnPagesPerWeek);
  const [reviewPages, setReviewPages] = useState(DEFAULT_SETTINGS.reviewPagesPerDay);

  const knownPages = useMemo(() => [...known].reduce((a, id) => a + surahPages(id), 0), [known]);
  const go = (n: number) => setStep(Math.max(0, Math.min(RECAP, n)));
  const finish = () => complete({ name, knownSurahs: [...known], learnDirection: learnDir, learnMode, learnPagesPerWeek: learnPages, reviewPagesPerDay: reviewPages });
  const demo = () => complete({ name, knownSurahs: [], learnDirection: 'forward', learnMode: 'surah', learnPagesPerWeek: 2, reviewPagesPerDay: 1, demo: true });

  if (step < INTRO) return <Intro i={step} go={go} onDemo={demo} />;

  const k = step - SETUP_FIRST;
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="pt-safe sticky top-0 z-20 bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[520px] items-center gap-3 px-[22px] py-3">
          <BackButton onClick={() => go(step - 1)} />
          {step >= SETUP_FIRST && <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface2" aria-label={`Étape ${k + 1} sur ${SETUP_COUNT}`}><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((k + 1) / SETUP_COUNT) * 100}%` }} /></div>}
        </div>
      </header>
      {step === ACCOUNT && <AccountStep onDone={() => go(NAME)} />}
      {step === NAME && <NameStep name={name} setName={setName} onNext={() => go(KNOWN)} />}
      {step === KNOWN && <KnownStep known={known} setKnown={setKnown} knownPages={knownPages} onNext={() => go(LEARN)} />}
      {step === LEARN && <LearnStep mode={learnMode} setMode={setLearnMode} pages={learnPages} setPages={setLearnPages} dir={learnDir} setDir={setLearnDir} known={known} onNext={() => go(REVIEW)} />}
      {step === REVIEW && <ReviewStep pages={reviewPages} setPages={setReviewPages} known={known} knownPages={knownPages} onNext={() => go(RECAP)} />}
      {step === RECAP && <Recap known={known} knownPages={knownPages} learnDir={learnDir} learnMode={learnMode} learnPages={learnPages} reviewPages={reviewPages} goTo={go} onFinish={finish} />}
    </div>
  );
}

function BackButton({ onClick, light }: { onClick: () => void; light?: boolean }) {
  return (
    <button onClick={onClick} aria-label="Retour" className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95', light ? 'border-white/25 bg-white/10 text-[#F4F1E8]' : 'border-line bg-surface text-ink')}>
      <ArrowLeft size={18} />
    </button>
  );
}

// ------------------------------------------------------------------ Présentation (3 écrans)
const FC = 'absolute rounded-[20px] bg-[#FBFAF6] p-[14px_16px] text-[#15221B] shadow-[0_24px_40px_-18px_rgba(0,0,0,.55)]';
const PILL = 'absolute flex items-center gap-[7px] rounded-full bg-[#E9D9A8] px-[13px] py-2 text-[12.5px] font-bold text-[#2A2010] shadow-[0_12px_24px_-10px_rgba(0,0,0,.5)]';

function Intro({ i, go, onDemo }: { i: number; go: (n: number) => void; onDemo: () => void }) {
  const [fatiha, setFatiha] = useState<string[] | null>(null);
  useEffect(() => {
    void loadQuranText().then((d) => d && setFatiha([d.s[0][0], d.s[0][1]]));
  }, []);
  const last = i === INTRO - 1;
  const slides = [
    {
      title: <>Ce que tu as appris,<br /><em className="not-italic text-[#BFD8C3]">garde-le.</em></>,
      text: 'On apprend de nouvelles sourates… et on oublie peu à peu les anciennes. WIRD est là pour que tes acquis restent solides.',
      art: (
        <>
          <div className={cx(FC, 'ob-float')} style={{ left: 22, top: 46, width: 250, rotate: '-4deg' }}><small className="text-[11.5px] font-semibold text-[#7B8078]">Al-Fatiha · verset 1</small><div className="ar text-[22px] leading-[1.7] text-[#1D4A37]" dir="rtl" lang="ar">{fatiha?.[0] ?? '\u00A0'}</div></div>
          <div className={cx(FC, 'ob-float-2')} style={{ right: 6, top: 168, width: 210, rotate: '3deg' }}><small className="text-[11.5px] font-semibold text-[#7B8078]">Al-Fatiha · verset 2</small><div className="ar text-[22px] leading-[1.7] text-[#1D4A37]" dir="rtl" lang="ar">{fatiha?.[1] ?? '\u00A0'}</div></div>
          <div className={cx(PILL, 'ob-float-3')} style={{ left: 30, bottom: 34 }}>✓ Toujours en mémoire</div>
        </>
      ),
    },
    {
      title: <>Un peu de révision,<br /><em className="not-italic text-[#BFD8C3]">chaque jour.</em></>,
      text: 'WIRD te prépare ton programme de révision au bon moment, selon ta maîtrise de chaque passage. Tu n’as plus qu’à réciter.',
      art: (
        <>
          <div className={FC} style={{ left: 16, top: 40, width: 270 }}>
            <small className="text-[11.5px] font-semibold text-[#7B8078]">Révisions du jour</small>
            {([["Al-A'la", 55, '#DF9638'], ['Ash-Shams', 85, '#2F7A55'], ['Al-Mulk', 70, '#2F7A55']] as const).map(([n, v, c]) => (
              <div key={n} className="mt-3"><div className="flex items-center justify-between"><span className="text-sm font-bold">{n}</span><small className="text-[11.5px] font-semibold text-[#7B8078]">{v}%</small></div><div className="mt-[7px] h-[6px] overflow-hidden rounded-full bg-[#EEEAE0]"><i className="block h-full rounded-full" style={{ width: `${v}%`, background: c }} /></div></div>
            ))}
          </div>
          <div className={cx(PILL, 'ob-float-2')} style={{ right: 14, bottom: 52 }}>📖 1 page par jour</div>
        </>
      ),
    },
    {
      title: <>Et continue<br /><em className="not-italic text-[#BFD8C3]">d’avancer.</em></>,
      text: 'Apprends de nouveaux versets à ton rythme, sans jamais laisser tes acquis de côté. Révise chaque jour pour garder ta flamme allumée 🔥',
      art: (
        <>
          <div className={FC} style={{ left: 18, top: 56, width: 272 }}>
            <small className="text-[11.5px] font-semibold text-[#7B8078]">Mes 114 sourates</small>
            <div className="mt-2.5 grid grid-cols-[repeat(19,1fr)] gap-[3px]">
              {Array.from({ length: 114 }, (_, n) => <i key={n} className="block aspect-square rounded-[3px]" style={{ background: n > 95 && n % 3 ? '#2F7A55' : n === 66 ? '#5B86C5' : n === 86 ? '#DF9638' : '#E7E3D9' }} />)}
            </div>
          </div>
          <div className={cx(FC, 'ob-float-2')} style={{ right: 20, bottom: 40, width: 150 }}><small className="text-[11.5px] font-semibold text-[#7B8078]">Série</small><div className="text-[22px] font-bold">🔥 7 jours</div></div>
        </>
      ),
    },
  ];
  const sl = slides[i];
  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden text-[#F4F1E8]" style={{ background: 'radial-gradient(120% 70% at 50% 30%,#2A6B50 0%,#164232 45%,#0C2A1F 100%)' }}>
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col">
        <div className="pt-safe flex min-h-[60px] items-center gap-3 px-[22px] pt-[18px]">
          {i > 0 && <BackButton light onClick={() => go(i - 1)} />}
          <span className="text-[13px] font-semibold opacity-70">0{i + 1} / 0{INTRO}</span>
          <div className="mx-1 flex flex-1 gap-1.5">{slides.map((_, n) => <i key={n} className="relative block h-1 flex-1 overflow-hidden rounded-full bg-white/20">{n <= i && <i className="absolute inset-0 rounded-full bg-[#E9D9A8]" />}</i>)}</div>
          <button className="py-2 text-[14.5px] font-semibold opacity-80" onClick={() => go(INTRO)}>Passer</button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center"><div key={i} className="relative h-[330px] w-[310px] animate-fade">
          <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle,rgba(233,217,168,.28),rgba(233,217,168,0) 65%)' }} />
          <div className="absolute bottom-1.5 left-1/2 h-[250px] w-[210px] -translate-x-1/2 rounded-[105px_105px_22px_22px] border border-[rgba(191,216,195,.22)]" style={{ background: 'linear-gradient(180deg,rgba(191,216,195,.16),rgba(191,216,195,.04))' }} />
          {sl.art}
        </div></div>
        <div className="px-[26px]">
          <h1 className="text-[31px] font-extrabold leading-[1.12] tracking-[-0.6px]">{sl.title}</h1>
          <p className="mt-2.5 text-[15px] leading-normal opacity-75">{sl.text}</p>
        </div>
        <div className="pb-safe flex items-center justify-between px-[22px] pb-[26px] pt-[26px]">
          <div className="flex gap-1.5">{slides.map((_, n) => <i key={n} className={cx('block h-[7px] rounded-full transition-all', n === i ? 'w-[22px] bg-[#F6F1E4]' : 'w-[7px] bg-white/30')} />)}</div>
          <button className="flex items-center gap-2.5 rounded-full bg-[#F6F1E4] px-[22px] py-4 text-[15.5px] font-bold text-[#1F4D3A] transition active:scale-95" onClick={() => go(i + 1)}>{last ? 'Commencer' : 'Suivant'} <ArrowRight size={18} /></button>
        </div>
        {last && <button onClick={onDemo} className="pb-safe pb-4 text-center text-xs text-white/60 underline underline-offset-4">Découvrir avec des données de démonstration</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Compte (e-mail + mot de passe)
function AccountStep({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S{2,}$/.test(email.trim()) && pw.length >= (mode === 'register' ? 8 : 1);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const e = await authenticate(mode, email.trim(), pw);
    setBusy(false);
    if (e) setErr(e);
    else onDone();
  };
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[22px] pb-32 pt-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Ton compte</p>
        <h1 className="mt-2 text-[27px] font-extrabold leading-[1.15] tracking-[-0.5px]">{mode === 'register' ? 'Crée ton compte' : 'Content de te revoir'}</h1>
        <p className="mt-2 text-[14.5px] leading-snug text-muted">Avec un compte, ta progression pourra te suivre d’un appareil à l’autre.</p>
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-surface2 p-1" role="tablist">
          {(['register', 'login'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null); }} className={cx('rounded-xl py-2.5 text-sm font-semibold transition', mode === m ? 'bg-surface shadow-sm' : 'text-muted')}>{m === 'register' ? 'Créer un compte' : 'Se connecter'}</button>)}
        </div>
        <input className="input mt-4 !rounded-[18px] !p-[18px] !text-[17px]" type="email" inputMode="email" autoComplete="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input mt-3 !rounded-[18px] !p-[18px] !text-[17px]" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder={mode === 'register' ? 'Mot de passe (8 caractères minimum)' : 'Mot de passe'} value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p role="alert" className="mt-3 text-sm text-hard">{err}</p>}
        {!accountAvailable && <p className="mt-3 text-xs text-muted">Le service de comptes n’est pas encore relié à cette installation : tu peux continuer sans compte.</p>}
      </div>
      <StickyFooter>
        <button className="btn-primary w-full" disabled={!valid || busy || !accountAvailable} onClick={() => void submit()}>{busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Me connecter'}</button>
        <button className="mt-1 w-full py-3 text-sm font-medium text-muted underline-offset-4 hover:underline" onClick={onDone}>Continuer sans compte</button>
      </StickyFooter>
    </>
  );
}

// ------------------------------------------------------------------ Prénom
function NameStep({ name, setName, onNext }: { name: string; setName: (s: string) => void; onNext: () => void }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[22px] pb-32 pt-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Faisons connaissance</p>
        <h1 className="mt-2 text-[27px] font-extrabold leading-[1.15] tracking-[-0.5px]">Comment t’appelles-tu ?</h1>
        <p className="mt-2 text-[14.5px] leading-snug text-muted">Pour te saluer chaque jour.</p>
        <input className="input mt-6 !rounded-[18px] !p-[18px] !text-[18px] !font-semibold" placeholder="Ton prénom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} autoFocus />
      </div>
      <StickyFooter><button className="btn-primary w-full" disabled={!name.trim()} onClick={onNext}>Continuer</button></StickyFooter>
    </>
  );
}

// ------------------------------------------------------------------ Sourates déjà apprises
function KnownStep({ known, setKnown, knownPages, onNext }: { known: Set<number>; setKnown: (s: Set<number>) => void; knownPages: number; onNext: () => void }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-3">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">Quelles sourates connais-tu déjà ?</h1>
        <p className="mb-4 mt-2 text-sm leading-relaxed text-muted">Coche celles que tu as apprises. Elles entreront dans ta révision : « connue » ne veut pas dire « plus besoin de réviser ». Tu pourras préciser verset par verset plus tard.</p>
        <KnownPicker known={known} setKnown={setKnown} />
      </div>
      <StickyFooter>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span><b className="tabular-nums">{known.size}</b> <span className="text-muted">/ 114 sourates</span></span>
          <span className="text-muted">≈ {formatPages(knownPages)}</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(known.size / 114) * 100}%` }} /></div>
        <button className="btn-primary w-full" onClick={onNext}>{known.size ? 'Continuer' : 'Je n’en connais pas encore'}</button>
      </StickyFooter>
    </>
  );
}

// ------------------------------------------------------------------ Apprentissage
function LearnStep({ mode, setMode, pages, setPages, dir, setDir, known, onNext }: { mode: LearnMode; setMode: (m: LearnMode) => void; pages: number; setPages: (n: number) => void; dir: Direction; setDir: (d: Direction) => void; known: Set<number>; onNext: () => void }) {
  const target = useMemo(() => {
    const verses: Record<number, VerseState> = {};
    for (const id of known) for (let a = 1; a <= surahMeta(id).n; a++) verses[ayahId(id, a)] = newMemorizedVerse(ayahId(id, a), '2000-01-01');
    return nextLearnTarget(verses, [], dir);
  }, [known, dir]);
  const modes: { v: LearnMode; title: string; sub: string }[] = [
    { v: 'surah', title: 'Une sourate par semaine', sub: 'Pour débuter : une sourate à la fois, répartie sur la semaine' },
    { v: 'pages', title: 'Des pages par semaine', sub: 'Une ou plusieurs pages du Mushaf chaque semaine' },
  ];
  const dirs: { v: Direction; label: string }[] = [{ v: 'forward', label: 'Al-Fatiha → An-Nas' }, { v: 'backward', label: 'An-Nas → Al-Fatiha' }];
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[22px] pb-32 pt-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Ton apprentissage</p>
        <h1 className="mt-2 text-[27px] font-extrabold leading-[1.15] tracking-[-0.5px]">Comment veux-tu apprendre ?</h1>
        <div className="mt-6 grid gap-2.5" role="radiogroup">
          {modes.map((o) => (
            <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => setMode(o.v)} className={cx('flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] p-4 text-left transition', mode === o.v ? 'border-primary bg-primary/10' : 'border-line bg-surface')}>
              <span className="flex-1"><b className="block text-[15.5px]">{o.title}</b><small className="text-[13px] text-muted">{o.sub}</small></span>
              <span className={cx('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2', mode === o.v ? 'border-primary bg-primary text-primary-ink' : 'border-line')}>{mode === o.v && <Check size={12} strokeWidth={3.5} />}</span>
            </button>
          ))}
        </div>
        {mode === 'pages' && <div className="card mt-3 flex items-center justify-between gap-3 p-4"><span className="font-semibold">Pages par semaine</span><PagesStepper value={pages} onChange={setPages} min={0} max={35} label="par semaine" /></div>}
        <p className="mb-2 mt-6 text-sm text-muted">Sens d’apprentissage des nouvelles sourates</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">{dirs.map((d) => <button key={d.v} role="radio" aria-checked={dir === d.v} onClick={() => setDir(d.v)} className="chip justify-center">{d.label}</button>)}</div>
        <p className="card mt-4 px-4 py-3 text-sm leading-relaxed">{target ? <>Prochaine sourate proposée : <b>{target.surah}. {surahMeta(target.surah).tr}</b>{target.from > 1 ? ` (à partir du verset ${target.from})` : ''}.</> : 'Tu as coché tout le Coran : il n’y a plus de nouvelle sourate à apprendre.'}</p>
      </div>
      <StickyFooter><button className="btn-primary w-full" onClick={onNext}>Continuer</button></StickyFooter>
    </>
  );
}

// ------------------------------------------------------------------ Compteur
export function PagesStepper({ value, onChange, min, max, label, step = 1 }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string; step?: number }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Math.round(n / step) * step)));
  return (
    <div className="flex items-center gap-2">
      <button aria-label={`Moins de pages ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value <= min} onClick={() => set(value - step)}><Minus size={18} /></button>
      <div className="w-[88px] text-center">
        <p className="font-display text-[30px] font-semibold leading-none tabular-nums">{new Intl.NumberFormat('fr-FR').format(value)}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-muted">{value > 1 ? 'pages' : 'page'}</p>
      </div>
      <button aria-label={`Plus de pages ${label}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-35" disabled={value >= max} onClick={() => set(value + step)}><Plus size={18} /></button>
    </div>
  );
}

// ------------------------------------------------------------------ Révision
function ReviewStep({ pages, setPages, known, knownPages, onNext }: { pages: number; setPages: (n: number) => void; known: Set<number>; knownPages: number; onNext: () => void }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[22px] pb-32 pt-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Ton rythme</p>
        <h1 className="mt-2 text-[27px] font-extrabold leading-[1.15] tracking-[-0.5px]">Combien de pages réviser par jour ?</h1>
        <p className="mt-2 text-[14.5px] leading-snug text-muted">La régularité compte plus que la quantité. Tu pourras changer cela à tout moment dans Profil.</p>
        <section className="card mt-6 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-display text-lg font-semibold">À réviser</p><p className="text-xs text-muted">Par jour, page du Mushaf par page</p></div>
            <PagesStepper value={pages} onChange={setPages} min={1} max={20} label="à réviser par jour" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{known.size === 0 ? 'Aucune sourate apprise pour l’instant : la révision démarrera dès que tu auras du contenu à réviser.' : `Tu connais environ ${formatPages(knownPages)} : un tour complet prendra environ ${Math.max(1, Math.ceil(knownPages / pages))} jour(s).`}</p>
        </section>
      </div>
      <StickyFooter><button className="btn-primary w-full" onClick={onNext}>Continuer</button></StickyFooter>
    </>
  );
}

// ------------------------------------------------------------------ Récapitulatif
function Recap({ known, knownPages, learnDir, learnMode, learnPages, reviewPages, goTo, onFinish }: { known: Set<number>; knownPages: number; learnDir: Direction; learnMode: LearnMode; learnPages: number; reviewPages: number; goTo: (s: number) => void; onFinish: () => void }) {
  const dir = (d: Direction) => (d === 'forward' ? 'Al-Fatiha → An-Nas' : 'An-Nas → Al-Fatiha');
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Sourates déjà apprises', value: known.size ? `${known.size} sourate${known.size > 1 ? 's' : ''} · ≈ ${formatPages(knownPages)}` : 'Aucune pour l’instant', step: KNOWN },
    { label: 'Apprentissage', value: `${learnMode === 'surah' ? 'Une sourate par semaine' : learnPages ? `${formatPages(learnPages)} par semaine` : 'Pas d’apprentissage'} · ${dir(learnDir)}`, step: LEARN },
    { label: 'Révision', value: `${formatPages(reviewPages)} par jour`, step: REVIEW },
  ];
  return (
    <>
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[22px] pb-32 pt-5">
        <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.5px]">Tout est prêt</h1>
        <p className="mt-2 text-[14.5px] leading-snug text-muted">Voici ta configuration, modifiable à tout moment depuis Profil.</p>
        <ul className="card mt-6 divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1"><p className="label">{r.label}</p><p className="mt-1 text-[15px] font-semibold">{r.value}</p></div>
              <button onClick={() => goTo(r.step)} className="text-sm font-semibold text-primary">Modifier</button>
            </li>
          ))}
        </ul>
      </div>
      <StickyFooter><button className="btn-primary w-full" onClick={onFinish}>C’est parti</button></StickyFooter>
    </>
  );
}
