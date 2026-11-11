import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SURAHS } from '@/engine/quran';
import { SurahNumber } from './ui';

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ًͯ-ٰٟۖ-ۭ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, '');

export function matchSurah(s: (typeof SURAHS)[number], q: string): boolean {
  const n = norm(q).trim();
  if (!n) return true;
  return String(s.id) === n || norm(s.tr).includes(n) || norm(s.fr).includes(n) || norm(s.ar).includes(n) || norm(s.tr).replace(/ /g, '').includes(n.replace(/ /g, ''));
}

export function SurahPickerList({ onPick, height = 'max-h-[50dvh]' }: { onPick: (id: number) => void; height?: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => SURAHS.filter((s) => matchSurah(s, q)), [q]);
  return (
    <div>
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Rechercher une sourate" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className={`mt-3 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line/70 bg-surface ${height}`}>
        {list.map((s) => (
          <li key={s.id}>
            <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface2" onClick={() => onPick(s.id)}>
              <SurahNumber n={s.id} size={36} />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{s.tr}</span>
                <span className="block text-xs text-muted">
                  {s.fr} · {s.n} versets
                </span>
              </span>
              <span className="ar text-xl" lang="ar">
                {s.ar}
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="p-6 text-center text-sm text-muted">Aucune sourate trouvée.</li>}
      </ul>
    </div>
  );
}
