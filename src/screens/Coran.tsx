import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Reader } from '@/components/Reader';
import { SubPage } from '@/components/ui';
import { pageOf } from '@/engine/pages';
import { ayahId } from '@/engine/quran';

/** Coran numérique : /coran?p=12 (pages) ou /coran?m=list&s=2 (liste d'une sourate). `h=s:a-b` surligne des versets. */
export default function Coran() {
  const [sp, setSp] = useSearchParams();
  const mode = sp.get('m') === 'list' ? 'list' : 'page';
  const s = Number(sp.get('s')) || null;
  const page = Number(sp.get('p')) || (s ? pageOf(ayahId(s, 1)) : 1);
  const hm = /^(\d+):(\d+)-(\d+)$/.exec(sp.get('h') ?? '');
  const highlight = hm ? { surah: +hm[1], from: +hm[2], to: +hm[3] } : null;
  const patch = (o: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(o)) v === null ? n.delete(k) : n.set(k, v);
    setSp(n, { replace: true });
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, s, mode]);
  return (
    <SubPage title="Coran numérique" back={-1}>
      <Reader
        page={page}
        surah={s}
        mode={mode}
        highlight={highlight}
        onPage={(p) => patch({ p: String(p), m: null })}
        onSurah={(n) => patch({ s: String(n), m: 'list', h: null })}
        onMode={(m) => (m === 'list' ? patch({ m: 'list', s: String(s ?? 1) }) : patch({ m: null, p: String(page) }))}
      />
    </SubPage>
  );
}
