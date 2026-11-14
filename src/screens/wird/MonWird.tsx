import { BookOpen, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FastScroll } from '@/components/FastScroll';
import { matchSurah } from '@/components/SurahPickerList';
import { Screen, Sheet, cx } from '@/components/ui';
import { allSurahStats, cellState, hizbSurahs, type CellState, type SurahStats } from '@/engine/progress';
import { HIZB_STARTS, SURAHS, surahMeta } from '@/engine/quran';
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
  const [hizb, setHizb] = useState<number | null>(null);
  const [hizbOpen, setHizbOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const inHizb = useMemo(() => (hizb ? new Set(hizbSurahs(hizb)) : null), [hizb]);
  const list = useMemo(
    () =>
      SURAHS.filter((s) => matchSurah(s, q)).filter((s) => !inHizb || inHizb.has(s.id)).filter((s) => {
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
    [q, f, stats, inHizb],
  );

  return (
    <Screen title="Mes sourates" sub="Mon Wird">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Rechercher une sourate…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une sourate" />
      </div>
      <Link to="/coran" className="btn-primary mt-2.5 w-full !min-h-[40px] text-sm" aria-label="Ouvrir le Coran numérique"><BookOpen size={18} /> Coran numérique</Link>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button key={x.v} onClick={() => setF(x.v)} aria-pressed={f === x.v} className="chip">{x.l}</button>
        ))}
        <button onClick={() => setHizbOpen(true)} className="chip" aria-pressed={!!hizb}>{hizb ? `Hizb ${hizb} ✕` : 'Par Hizb'}</button>
      </div>
      <p className="mt-3 text-xs text-muted">{list.length} sourate{list.length > 1 ? 's' : ''}{hizb ? ` dans le Hizb ${hizb}` : ''}</p>
      <div ref={listRef} className="mt-1 space-y-2.5">
        {list.map((s) => <SurahCard key={s.id} st={stats[s.id - 1]} />)}
        {!list.length && <p className="card p-6 text-center text-sm text-muted">Aucune sourate ne correspond.</p>}
      </div>
      <FastScroll targetRef={listRef} count={list.length} label={(i) => (list[i] ? `${list[i].id}. ${list[i].tr}` : '')} />
      <Sheet open={hizbOpen} onClose={() => setHizbOpen(false)} title="Filtrer par Hizb">
        <p className="mb-3 text-sm text-muted">Affiche les sourates dont au moins un verset appartient au Hizb choisi (Mushaf de Médine).</p>
        <div className="grid grid-cols-6 gap-2">
          {HIZB_STARTS.map((_, i) => (
            <button key={i} onClick={() => { setHizb(hizb === i + 1 ? null : i + 1); setHizbOpen(false); }} className={cx('flex h-11 items-center justify-center rounded-xl text-sm font-bold tabular-nums', hizb === i + 1 ? 'bg-primary text-primary-ink' : 'bg-surface2')}>{i + 1}</button>
          ))}
        </div>
        {hizb && <button className="btn-ghost mt-3 w-full" onClick={() => { setHizb(null); setHizbOpen(false); }}>Toutes les sourates</button>}
      </Sheet>
    </Screen>
  );
}

function SurahCard({ st }: { st: SurahStats }) {
  const s = surahMeta(st.surah);
  const cs = cellState(st);
  const tag = STATE_TAG[cs];
  return (
    <Link to={`/wird/${s.id}`} className={cx('card block border-l-4 p-4 transition active:scale-[.99]', tag.bar)}>
      <div className="flex items-start justify-between gap-2">
        <b className="text-base">{s.id}. {s.tr} <span className="ar ml-1 text-[19px] font-normal" lang="ar">{s.ar}</span></b>
        {tag.label ? <span className={cx('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs', tag.cls)}>{tag.label}</span> : <span className="shrink-0 text-sm text-muted">{s.n} versets</span>}
      </div>
      <div className="my-2.5 h-1.5 overflow-hidden rounded-full bg-surface2"><i className="block h-full rounded-full bg-primary" style={{ width: `${(st.memorized / st.total) * 100}%` }} /></div>
      <p className="text-sm text-muted">
        {st.memorized}/{st.total} appris{st.learning ? ` · ${st.learning} en apprentissage` : ''}{st.fragile ? ` · ${st.fragile} à renforcer` : ''} · {st.last ? `dernière activité ${formatDateShort(st.last).replace(/^\w+\.? /, '')}` : 'jamais travaillée'}
      </p>
    </Link>
  );
}
