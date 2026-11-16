import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/components/ui';
import { fromAyahId, hizbRange, surahMeta } from '@/engine/quran';

interface Part { surah: number; from: number; to: number }

/** Parties de sourates d'un Hizb, d'après les débuts de Hizb de Tanzil (recoupés avec quran-meta). */
export function hizbParts(h: number): Part[] {
  const [a, b] = hizbRange(h);
  const s1 = fromAyahId(a);
  const s2 = fromAyahId(b);
  const out: Part[] = [];
  for (let s = s1.surah; s <= s2.surah; s++) out.push({ surah: s, from: s === s1.surah ? s1.ayah : 1, to: s === s2.surah ? s2.ayah : surahMeta(s).n });
  return out;
}

const rangeText = (p: Part) => {
  const full = p.from === 1 && p.to === surahMeta(p.surah).n;
  return full ? 'sourate entière' : p.from === p.to ? `verset ${p.from}` : `versets ${p.from} à ${p.to}`;
};

/** Juz 1–30 › Hizb 1–60 › sourates et plages de versets exactes, en accordéons compacts. */
export function JuzHizbList() {
  const [juz, setJuz] = useState<number | null>(null);
  const [hizb, setHizb] = useState<number | null>(null);
  const parts = useMemo(() => Array.from({ length: 60 }, (_, i) => hizbParts(i + 1)), []);
  const label = (h: number) => {
    const p = parts[h - 1];
    const first = surahMeta(p[0].surah).tr;
    const last = surahMeta(p[p.length - 1].surah).tr;
    return first === last ? first : `${first} → ${last}`;
  };

  return (
    <ul className="mt-3 space-y-2">
      {Array.from({ length: 30 }, (_, j) => {
        const n = j + 1;
        const open = juz === n;
        return (
          <li key={n} className="card overflow-hidden">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open} onClick={() => { setJuz(open ? null : n); setHizb(null); }}>
              <span className="flex-1"><b className="block text-[16px]">Juz {n}</b><span className="text-xs text-muted">Hizb {n * 2 - 1} et {n * 2}</span></span>
              <ChevronDown size={18} className={cx('shrink-0 text-muted transition', open && 'rotate-180')} />
            </button>
            {open && (
              <ul className="animate-fade divide-y divide-line border-t border-line">
                {[n * 2 - 1, n * 2].map((h) => {
                  const hOpen = hizb === h;
                  return (
                    <li key={h}>
                      <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left" aria-expanded={hOpen} onClick={() => setHizb(hOpen ? null : h)}>
                        <span className="min-w-0 flex-1"><b className="block text-[14.5px]">Hizb {h}</b><span className="block truncate text-xs text-muted">{label(h)}</span></span>
                        <ChevronDown size={16} className={cx('shrink-0 text-muted transition', hOpen && 'rotate-180')} />
                      </button>
                      {hOpen && (
                        <ul className="animate-fade bg-surface2/40 px-4 pb-2">
                          {parts[h - 1].map((p) => (
                            <li key={`${p.surah}-${p.from}`}>
                              <Link to={`/wird/${p.surah}`} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                                <span className="font-semibold">{p.surah}. {surahMeta(p.surah).tr}</span>
                                <span className="shrink-0 text-xs text-muted">{rangeText(p)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
