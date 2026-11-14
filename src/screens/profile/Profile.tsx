import { Bell, ChevronRight, Download, Smartphone, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { ConfirmSheet, Screen, Segmented, Toggle, toast } from '@/components/ui';
import { dateKey } from '@/engine/dates';
import type { Direction, LearnMode, ThemeMode } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { isIOS, isStandalone, useInstall } from '@/lib/pwa';
import { APP_VERSION } from '@/lib/version';
import { PagesStepper } from '@/screens/Onboarding';
import { useWird } from '@/store/useWird';

const DIR: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Al-Fatiha → An-Nas' },
  { value: 'backward', label: 'An-Nas → Al-Fatiha' },
];

/** Profil : une page de cartes (comme l'artefact) — identité, objectifs en pages, apparence, données. */
export default function Profile() {
  const nav = useNavigate();
  const { profile, settings, updateSettings, exportData, importData, resetAll } = useWird();
  const install = useInstall((s) => s.event);
  const [reset, setReset] = useState(false);
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
    <Screen title="Profil" sub="Réglages et confidentialité">
      <Link to="/profil/profil" className="card flex items-center gap-4 p-4">
        <Avatar gender={profile.gender} size={56} className="shrink-0 rounded-full" />
        <span className="min-w-0 flex-1"><b className="block truncate text-[17px]">{profile.name || 'Mon profil'}</b><span className="text-sm text-muted">Prénom, âge, photo de profil</span></span>
        <ChevronRight size={18} className="text-muted" />
      </Link>

      <div className="card mt-3 space-y-4 p-4">
        <b>Apprentissage et révision</b>
        <div>
          <p className="mb-1.5 text-sm text-muted">Apprentissage</p>
          <Segmented<LearnMode> value={settings.learnMode} onChange={(learnMode) => updateSettings({ learnMode })} options={[{ value: 'surah', label: 'Une sourate par semaine' }, { value: 'pages', label: 'Pages par semaine' }]} />
          {settings.learnMode === 'pages' ? (
            <div className="mt-3 flex items-center justify-between gap-3"><span>Pages par semaine</span><PagesStepper value={settings.learnPagesPerWeek} min={0} max={35} onChange={(n) => updateSettings({ learnPagesPerWeek: n })} label="à apprendre par semaine" /></div>
          ) : <p className="mt-2 text-xs text-muted">Idéal pour débuter : une sourate à la fois, répartie sur la semaine.</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3"><span>Pages à réviser par jour</span><PagesStepper value={settings.reviewPagesPerDay} min={1} max={20} onChange={(n) => updateSettings({ reviewPagesPerDay: n })} label="à réviser" /></div>
          <p className="mt-1 text-xs text-muted">Si tu connais moins de contenu, la révision se limite à ce que tu as. Rien n’est reporté ni dû.</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">Sens d’apprentissage des nouvelles sourates</p>
          <Segmented<Direction> value={settings.learnDirection} onChange={(learnDirection) => updateSettings({ learnDirection })} options={DIR} />
        </div>
      </div>

      <div className="card mt-3 space-y-3 p-4">
        <b>Apparence</b>
        <Segmented<ThemeMode> value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'system', label: 'Automatique' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        <div className="flex items-center justify-between gap-3">
          <div><p>Retours haptiques</p><p className="text-xs text-muted">Légères vibrations quand l’appareil le permet.</p></div>
          <Toggle label="Retours haptiques" checked={settings.haptics} onChange={(haptics) => { updateSettings({ haptics }); if (haptics) setTimeout(() => haptic('success'), 50); }} />
        </div>
      </div>

      <div className="card mt-3 p-4">
        <b>Sourates déjà apprises</b>
        <p className="mb-2 text-sm text-muted">Indique en un tap les sourates que tu connais déjà : elles passent en révision.</p>
        <button className="btn-soft w-full" onClick={() => nav('/connues')}>Choisir mes sourates</button>
      </div>

      <Link to="/profil/notifications" className="card mt-3 flex items-center gap-3 p-4"><Bell size={20} className="text-primary" /><span className="flex-1"><b className="block">Rappels</b><span className="text-sm text-muted">Quatre rappels indépendants, horaires au choix</span></span><ChevronRight size={18} className="text-muted" /></Link>

      {!isStandalone() && (
        <div className="card mt-3 flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 shrink-0 text-primary" size={22} />
          <div className="text-sm">
            <b>Installer WIRD</b>
            {isIOS() ? <p className="mt-1 leading-relaxed text-muted">Dans Safari, touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b>. WIRD s’ouvre alors en plein écran, hors connexion comprise.</p> : install ? <button className="btn-soft mt-2 !min-h-[40px]" onClick={() => void install.prompt()}>Installer sur cet appareil</button> : <p className="mt-1 leading-relaxed text-muted">Utilise le menu de ton navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>}
          </div>
        </div>
      )}

      <Link to="/profil/apropos" className="card mt-3 flex items-center gap-3 p-4"><span className="flex-1"><b className="block">À propos</b><span className="text-sm text-muted">Sources du texte, licences, version {APP_VERSION}</span></span><ChevronRight size={18} className="text-muted" /></Link>

      <div className="mt-4 grid gap-2.5">
        <button className="btn-soft" onClick={doExport}><Download size={18} /> Exporter mes données (JSON)</button>
        <button className="btn-soft" onClick={() => file.current?.click()}><Upload size={18} /> Restaurer une sauvegarde (JSON)</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const r = importData(await f.text()); toast(r.ok ? 'Sauvegarde restaurée' : r.error); }} />
        <button className="btn-danger" onClick={() => setReset(true)}>Tout réinitialiser…</button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">Tout est enregistré sur cet appareil. {profile.demo ? 'Tu utilises des données de démonstration. ' : ''}Pense à exporter une sauvegarde : si l’appareil est réinitialisé, les données locales peuvent être perdues.</p>
      <p className="mt-2 text-center text-xs text-muted">WIRD {APP_VERSION}</p>
      <ConfirmSheet open={reset} onClose={() => setReset(false)} title="Tout effacer ?" message="Cette action est définitive et efface aussi la corbeille. Pense à exporter une sauvegarde avant. WIRD repartira de l’écran de bienvenue." confirmLabel="Effacer définitivement" danger onConfirm={() => void resetAll()} />
    </Screen>
  );
}
