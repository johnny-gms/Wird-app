import { Bell, ChevronRight, Download, Smartphone, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LearnLevels, ReviewLevels, learnPatch, learnValueFromSettings, reviewPatch, reviewValueFromSettings } from '@/components/LevelPickers';
import { ConfirmSheet, Segmented, SubPage, Toggle, toast } from '@/components/ui';
import { dateKey } from '@/engine/dates';
import type { Direction, ThemeMode } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { isIOS, isStandalone, useInstall } from '@/lib/pwa';
import { APP_VERSION } from '@/lib/version';
import { useWird } from '@/store/useWird';

const DIR: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Al-Fatiha → An-Nas' },
  { value: 'backward', label: 'An-Nas → Al-Fatiha' },
];

const Section = ({ children }: { children: React.ReactNode }) => <h2 className="label mb-2 mt-7">{children}</h2>;

/** Paramètres : réglages organisés en sections claires (le Profil ne garde que l'identité et les accès). */
export default function Settings() {
  const nav = useNavigate();
  const { profile, settings, updateSettings, exportData, importData, resetAll } = useWird();
  const install = useInstall((s) => s.event);
  const [reset, setReset] = useState(false);
  const [restore, setRestore] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const doExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wird-sauvegarde-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Export prêt');
  };

  return (
    <SubPage title="Paramètres" back="/profil">
      <Section>Mémorisation et révision</Section>
      <div className="card space-y-4 p-4">
        <b>Mémorisation et révision</b>
        <div>
          <p className="mb-2 text-sm text-muted">Apprentissage de nouveaux versets</p>
          <LearnLevels value={learnValueFromSettings(settings)} onChange={(v) => updateSettings(learnPatch(v))} />
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Révision</p>
          <ReviewLevels value={reviewValueFromSettings(settings)} onChange={(v) => updateSettings(reviewPatch(v))} />
          <p className="mt-1 text-xs text-muted">Si tu connais moins de contenu, la révision se limite à ce que tu as. Rien n’est reporté ni dû.</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">Sens d’apprentissage des nouvelles sourates</p>
          <Segmented<Direction> value={settings.learnDirection} onChange={(learnDirection) => updateSettings({ learnDirection })} options={DIR} />
        </div>
      </div>


      <Section>Apparence</Section>
      <div className="card space-y-3 p-4">
        <Segmented<ThemeMode> value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'system', label: 'Automatique' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        <div className="flex items-center justify-between gap-3">
          <div><p>Retours haptiques</p><p className="text-xs text-muted">Légères vibrations quand l’appareil le permet.</p></div>
          <Toggle label="Retours haptiques" checked={settings.haptics} onChange={(haptics) => { updateSettings({ haptics }); if (haptics) setTimeout(() => haptic('success'), 50); }} />
        </div>
      </div>


      <Section>Sourates déjà apprises</Section>
      <div className="card p-4">
        <p className="mb-2 text-sm text-muted">Indique en un tap les sourates que tu connais avant WIRD. Elles sont marquées apprises, sans compter comme du travail dans l’application.</p>
        <button className="btn-soft w-full" onClick={() => nav('/connues')}>Choisir mes sourates</button>
      </div>


      <Section>Rappels</Section>
      <Link to="/profil/notifications" className="card flex items-center gap-3 p-4"><Bell size={20} className="text-primary" /><span className="flex-1"><b className="block">Rappels</b><span className="text-sm text-muted">Quatre rappels indépendants, horaires au choix</span></span><ChevronRight size={18} className="text-muted" /></Link>

      {!isStandalone() && (
        <div className="card mt-3 flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 shrink-0 text-primary" size={22} />
          <div className="text-sm">
            <b>Installer WIRD</b>
            {isIOS() ? <p className="mt-1 leading-relaxed text-muted">Dans Safari, touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b>. WIRD s’ouvre alors en plein écran, hors connexion comprise.</p> : install ? <button className="btn-soft mt-2 !min-h-[40px]" onClick={() => void install.prompt()}>Installer sur cet appareil</button> : <p className="mt-1 leading-relaxed text-muted">Utilise le menu de ton navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>}
          </div>
        </div>
      )}


      <Section>Données et sauvegardes</Section>
      <div className="grid gap-2.5">
        <button className="btn-soft" onClick={doExport}><Download size={18} /> Exporter mes données (JSON)</button>
        <button className="btn-soft" onClick={() => file.current?.click()}><Upload size={18} /> Restaurer une sauvegarde (JSON)</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setRestore(await f.text()); }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">Tout est enregistré sur cet appareil. {profile.demo ? 'Tu utilises des données de démonstration. ' : ''}Pense à exporter une sauvegarde : si l’appareil est réinitialisé, les données locales peuvent être perdues.</p>

      <Section>À propos</Section>
      <Link to="/profil/apropos" className="card flex items-center gap-3 p-4"><span className="flex-1"><b className="block">À propos</b><span className="text-sm text-muted">Sources du texte, licences, version {APP_VERSION}</span></span><ChevronRight size={18} className="text-muted" /></Link>


      <Section>Réinitialisation</Section>
      <button className="btn-danger w-full" onClick={() => setReset(true)}>Tout réinitialiser…</button>
      <p className="mt-2 text-center text-xs text-muted">WIRD {APP_VERSION}</p>

      <ConfirmSheet open={restore !== null} onClose={() => setRestore(null)} title="Restaurer cette sauvegarde ?" message="Les données actuelles de cet appareil seront remplacées par celles du fichier. Exporte d’abord une sauvegarde si tu veux pouvoir revenir en arrière." confirmLabel="Restaurer" danger onConfirm={() => { const r = importData(restore ?? ''); toast(r.ok ? 'Sauvegarde restaurée' : r.error); setRestore(null); }} />
      <ConfirmSheet open={reset} onClose={() => setReset(false)} title="Tout effacer ?" message="Cette action est définitive : ta progression, tes objectifs, ton historique et ta corbeille seront effacés de cet appareil. Pense à exporter une sauvegarde avant. WIRD repartira de l’écran de bienvenue." confirmLabel="Effacer définitivement" danger onConfirm={() => void resetAll()} />
    </SubPage>
  );
}
