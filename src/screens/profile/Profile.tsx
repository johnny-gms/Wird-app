import { Bell, ChevronRight, Download, Smartphone, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmSheet, Screen, Segmented, Toggle, toast } from '@/components/ui';
import { dateKey } from '@/engine/dates';
import type { Direction, ThemeMode } from '@/engine/types';
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
  const { profile, setName, settings, updateSettings, trash, exportData, importData, resetAll } = useWird();
  const install = useInstall((s) => s.event);
  const [name, setN] = useState(profile.name);
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
      <div className="card p-4">
        <label className="text-sm text-muted">Nom ou pseudonyme</label>
        <input className="input mt-1.5" value={name} placeholder="Facultatif" maxLength={40} onChange={(e) => setN(e.target.value)} onBlur={() => setName(name)} autoComplete="given-name" />
        <p className="mt-2 text-xs text-muted">Utilisé pour l’accueil. Il reste sur ton appareil. Aucun compte n’est requis.</p>
      </div>

      <div className="card mt-3 space-y-4 p-4">
        <b>Apprentissage et révision</b>
        <div>
          <div className="flex items-center justify-between gap-3"><span>Pages à apprendre</span><PagesStepper value={settings.learnPagesPerDay} min={0} max={5} onChange={(n) => updateSettings({ learnPagesPerDay: n })} label="à apprendre" /></div>
          <p className="mt-1 text-xs text-muted">0 = pas de nouvel apprentissage. Un repère, jamais une obligation.</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3"><span>Pages à réviser</span><PagesStepper value={settings.reviewPagesPerDay} min={0} max={20} onChange={(n) => updateSettings({ reviewPagesPerDay: n })} label="à réviser" /></div>
          <p className="mt-1 text-xs text-muted">Si tu connais moins de contenu, la révision se limite à ce que tu as. Rien n’est reporté ni dû.</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">Sens d’apprentissage des nouvelles sourates</p>
          <Segmented<Direction> value={settings.learnDirection} onChange={(learnDirection) => updateSettings({ learnDirection })} options={DIR} />
        </div>
        <p className="rounded-xl bg-surface2 px-3 py-2.5 text-xs leading-relaxed text-muted">Révision : toujours Hizb par Hizb, du 1<sup>er</sup> au 60<sup>e</sup>, et chaque Hizb du début vers la fin. Un verset difficile reste dans la rotation et revient plus tôt en renforcement.</p>
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
      <Link to="/profil/corbeille" className="card mt-3 flex items-center gap-3 p-4"><Trash2 size={20} className="text-primary" /><span className="flex-1"><b className="block">Corbeille</b><span className="text-sm text-muted">{trash.length ? `${trash.length} élément${trash.length > 1 ? 's' : ''} restaurable${trash.length > 1 ? 's' : ''} pendant 30 jours` : 'Vide · les retraits restent restaurables 30 jours'}</span></span><ChevronRight size={18} className="text-muted" /></Link>

      {!isStandalone() && (
        <div className="card mt-3 flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 shrink-0 text-primary" size={22} />
          <div className="text-sm">
            <b>Installer WIRD</b>
            {isIOS() ? <p className="mt-1 leading-relaxed text-muted">Dans Safari, touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b>. WIRD s’ouvre alors en plein écran, hors connexion comprise.</p> : install ? <button className="btn-soft mt-2 !min-h-[40px]" onClick={() => void install.prompt()}>Installer sur cet appareil</button> : <p className="mt-1 leading-relaxed text-muted">Utilise le menu de ton navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>}
          </div>
        </div>
      )}

      <div className="card mt-3 p-4"><b className="block">Synchronisation</b><span className="text-sm text-muted">Pas encore active : elle nécessitera un compte (connexion Google ou Apple, prévue plus tard). D’ici là, tes données restent uniquement sur cet appareil, et tu peux les exporter depuis les réglages.</span></div>
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
