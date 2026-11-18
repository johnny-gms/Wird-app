import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LearnLevels, ReviewLevels, learnPatch, learnValueFromSettings, reviewPatch, reviewValueFromSettings } from '@/components/LevelPickers';
import { Segmented, SubPage } from '@/components/ui';
import type { Direction } from '@/engine/types';
import { useWird } from '@/store/useWird';

const DIR: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Al-Fatiha → An-Nas' },
  { value: 'backward', label: 'An-Nas → Al-Fatiha' },
];

const Section = ({ children }: { children: React.ReactNode }) => <h2 className="label mb-2 mt-7">{children}</h2>;

/** Sous-page des paramètres : rythme d'apprentissage, rythme de révision, sens, sourates déjà apprises. */
export default function SettingsMemorisation() {
  const { settings, updateSettings } = useWird();
  return (
    <SubPage title="Mémorisation" back="/profil/parametres" sub="Ton rythme d’apprentissage et de révision">
      <Section>Apprentissage de nouveaux versets</Section>
      <div className="card p-4">
        <LearnLevels value={learnValueFromSettings(settings)} onChange={(v) => updateSettings(learnPatch(v))} />
        <p className="mb-1.5 mt-5 text-sm text-muted">Sens d’apprentissage des nouvelles sourates</p>
        <Segmented<Direction> value={settings.learnDirection} onChange={(learnDirection) => updateSettings({ learnDirection })} options={DIR} />
      </div>

      <Section>Révision</Section>
      <div className="card p-4">
        <ReviewLevels value={reviewValueFromSettings(settings)} onChange={(v) => updateSettings(reviewPatch(v))} />
        <p className="mt-3 text-xs text-muted">Si tu connais moins de contenu, la révision se limite à ce que tu as. Rien n’est reporté ni dû.</p>
      </div>

      <Section>Sourates déjà apprises</Section>
      <Link to="/connues" className="card flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1"><b className="block">Choisir mes sourates</b><span className="block text-sm text-muted">Celles que tu connais avant WIRD, marquées apprises sans compter comme du travail.</span></span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    </SubPage>
  );
}
