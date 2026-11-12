import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KnownPicker } from '@/components/KnownPicker';
import { StickyFooter, SubPage, toast } from '@/components/ui';
import { formatPages, rangePages } from '@/engine/pages';
import { SURAHS, ayahId } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { useWird } from '@/store/useWird';

/** « Sourates déjà apprises » : coche des sourates entières ; elles entrent dans la rotation de révision. */
export default function KnownScreen() {
  const nav = useNavigate();
  const { verses, applyKnownSurahs } = useWird();
  const initial = useMemo(() => new Set(SURAHS.filter((s) => Array.from({ length: s.n }, (_, i) => verses[ayahId(s.id, i + 1)]?.status === 'memorized').every(Boolean)).map((s) => s.id)), [verses]);
  const [sel, setSel] = useState<Set<number>>(initial);
  const pages = [...sel].reduce((a, id) => a + rangePages(id, 1, SURAHS[id - 1].n), 0);
  return (
    <SubPage title="Sourates déjà apprises" back={-1}>
      <p className="-mt-1 mb-3 text-sm leading-relaxed text-muted">Touche une sourate entière : tous ses versets sont comptés comme appris et reviennent en révision progressivement. Décocher une sourate la retire du suivi (corbeille 30 jours), sauf les versets que tu as déjà travaillés dans l’app.</p>
      <div className="pb-28"><KnownPicker known={sel} setKnown={setSel} /></div>
      <StickyFooter>
        <div className="mb-2 flex justify-between text-sm"><span><b className="tabular-nums">{sel.size}</b> <span className="text-muted">/ 114 sourates</span></span><span className="text-muted">≈ {formatPages(pages)}</span></div>
        <button className="btn-primary w-full" onClick={() => { haptic('success'); applyKnownSurahs([...sel]); toast('Sourates enregistrées'); nav(-1); }}>Enregistrer</button>
      </StickyFooter>
    </SubPage>
  );
}
