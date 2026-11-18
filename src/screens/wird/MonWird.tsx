import { BookOpen, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { JuzHizbList } from './JuzHizb';
import { FastScroll } from '@/components/FastScroll';
import { matchSurah } from '@/components/SurahPickerList';
import { Screen, cx } from '@/components/ui';
import { allSurahStats, cellState, type CellState, type SurahStats } from '@/engine/progress';
import { SURAHS, fromAyahId, surahMeta } from '@/engine/quran';
import { formatDateShort, useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

type Filter = 'all' | 'none' | 'progress' | 'learned' | 'reinforce';
const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'Toutes' },
  { v: 'none', l: 'Non commencées' },
  { v: 'progress', l: 'En cours' },
  { v: 'learned', l: 'Apprises' },
  { v: 'reinforce', l: 'À renforcer' },
];

export const STATE_TAG: Record<CellState, { label: string; cls: string; bar: string }> = {
  learned: { label: 'Sourate apprise ✓', cls: 'bg-good text-white', bar: 'border-l-good' },
  learning: { label: 'En cours', cls: 'bg-blue text-white', bar: 'border-l-blue' },
  reinforce: { label: 'À renforcer', cls: 'bg-hard text-white', bar: 'border-l-hard' },
  none: { label: '', cls: '', bar: 'border-l-neutral' },
};

/** Mon Wird : les 114 sourates sous forme de cartes, avec leur état (même code couleur partout). */
export default function MonWird() {
  const today = useToday();
  const verses = useWird((s) => s.verses);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [view, setView] = useState<'surahs' | 'juz'>('surahs');
  const listRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  // sourates dont tous les versets appris sont simplement déclarés (jamais travaillés dans WIRD)
  const workedSurahs = useMemo(() => {
    const worked = new Set<number>();
    for (const k in verses) if (verses[k].status === 'memorized' && !verses[k].declared) worked.add(fromAyahId(Number(k)).surah);
    return worked;
  }, [verses]);
  const list = useMemo(
    () =>
      SURAHS.filter((s) => matchSurah(s, q)).filter((s) => {
        const st = stats[s.id - 1];
        const cs = cellState(st);
        switch (f) {
          case 'none': return st.state === 'none';
          case 'progress': return st.state === 'partial' || st.state === 'learning';
          case 'learned': return st.state === 'complete';
          case 'reinforce': return cs === 'reinforce';
          default: return true;
        }
      }),
    [q, f, stats],
  );

  return (
    <Screen title="Mon Wird" sub="Les 114 sourates, le Coran numérique et les Juz">
      {view === 'juz' ? (
        <>
          <Link to="/coran" className="btn-soft w-full !min-h-[36px] !py-1.5 text-sm" aria-label="Ouvrir le Coran numérique"><BookOpen size={16} /> Coran numérique</Link>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <p>30 Juz · 60 Hizb</p>
            <button onClick={() => setView('surahs')} className="font-semibold text-primary">Voir par sourate</button>
          </div>
          <JuzHizbList />
        </>
      ) : (
        <>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Rechercher une sourate…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
        </div>
        <Link to="/coran" className="btn-soft mt-2.5 w-full !min-h-[36px] !py-1.5 text-sm" aria-label="Ouvrir le Coran numérique"><BookOpen size={16} /> Coran numérique</Link>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par état">
          {FILTERS.map((x) => (
            <button key={x.v} onClick={() => setF(x.v)} aria-pressed={f === x.v} className="chip chip-sm">{x.l}</button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <p>{list.length} sourate{list.length > 1 ? 's' : ''}</p>
        <button onClick={() => setView('juz')} className="font-semibold text-primary">Organiser par Juz et Hizb</button>
      </div>
        <div ref={listRef} className="mt-1 space-y-2.5">
          {list.map((s) => <SurahCard key={s.id} st={stats[s.id - 1]} declared={!workedSurahs.has(s.id)} />)}
          {!list.length && <p className="card p-6 text-center text-sm text-muted">Aucune sourate ne correspond.</p>}
        </div>
        <FastScroll targetRef={listRef} count={list.length} label={(i) => (list[i] ? `${list[i].id}. ${list[i].tr}` : '')} />
        </>
      )}
    </Screen>
  );
}

function SurahCard({ st, declared }: { st: SurahStats; declared: boolean }) {
  const s = surahMeta(st.surah);
  const cs = cellState(st);
  const tag = STATE_TAG[cs];
  return (
    <Link to={`/wird/${s.id}`} className={cx('card block border-l-4 p-4 transition active:scale-[.99]', tag.bar)}>
      <div className="flex items-start justify-between gap-2">
        <b className="text-base">{s.id}. {s.tr} <span className="ar ml-1 text-[19px] font-normal" lang="ar">{s.ar}</span></b>
        {tag.label ? <span className={cx('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs', tag.cls)}>{cs === 'learned' && declared ? 'Déjà apprise' : tag.label}</span> : <span className="shrink-0 text-sm text-muted">{s.n} versets</span>}
      </div>
      <div className="my-2.5 h-1.5 overflow-hidden rounded-full bg-surface2"><i className="block h-full rounded-full bg-accent" style={{ width: `${(st.memorized / st.total) * 100}%` }} /></div>
      <p className="text-sm text-muted">
        {st.memorized}/{st.total} appris{st.learning ? ` · ${st.learning} en apprentissage` : ''}{st.fragile ? ` · ${st.fragile} à renforcer` : ''} · {st.last ? `dernière activité ${formatDateShort(st.last).replace(/^\w+\.? /, '')}` : 'jamais travaillée'}
      </p>
    </Link>
  );
}
