import { Bell, BellOff, CheckCircle2, Download, Minus, Plus, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ConfirmSheet, SubPage, Segmented, Toggle, toast } from '@/components/ui';
import { PagesStepper } from '@/screens/Onboarding';
import type { Direction, NotificationPrefs } from '@/engine/types';
import { disableNotifications, enableNotifications, getPushStatus, sendLocalTest, serverConfigured, type PushStatus } from '@/notifications/client';
import { dateKey } from '@/engine/dates';
import { useWird } from '@/store/useWird';
import { APP_VERSION } from '@/lib/version';

function Stepper({ value, min, max, step = 1, onChange, unit }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit: string }) {
  return (
    <div className="flex items-center gap-1">
      <button className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Diminuer"><Minus size={16} /></button>
      <span className="w-20 text-center text-sm font-semibold tabular-nums">{value} {unit}</span>
      <button className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="Augmenter"><Plus size={16} /></button>
    </div>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold">{title}</p>
        {children}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Paramètres du Wird
const DIR_OPTS: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Al-Fatiha → An-Nas' },
  { value: 'backward', label: 'An-Nas → Al-Fatiha' },
];

export function ProfileWird() {
  const { settings, updateSettings } = useWird();
  return (
    <SubPage title="Paramètres du Wird" back="/profil">
      <h2 className="label mb-2">Programme quotidien</h2>
      <section className="card divide-y divide-line/70">
        <Field title="Pages à apprendre" hint="Nouvelles sourates, en pages du Mushaf de Médine. 0 = pas de nouvel apprentissage. Si rien ne reste à apprendre, rien n’est inventé.">
          <PagesStepper value={settings.learnPagesPerDay} min={0} max={5} onChange={(n) => updateSettings({ learnPagesPerDay: n })} label="à apprendre" />
        </Field>
        <Field title="Pages à réviser" hint="Rotation de vos sourates apprises. Si vous en connaissez moins, la révision se limite à ce contenu. Jamais une dette : ce qui n’est pas fait n’est pas reporté.">
          <PagesStepper value={settings.reviewPagesPerDay} min={0} max={20} onChange={(n) => updateSettings({ reviewPagesPerDay: n })} label="à réviser" />
        </Field>
        <Field title="Renforcement maximum" hint="Plafond de versets fragiles proposés par jour, pour ne jamais surcharger.">
          <Stepper value={settings.reinforceVersesPerDay} min={5} max={60} step={5} unit="versets" onChange={(n) => updateSettings({ reinforceVersesPerDay: n })} />
        </Field>
      </section>

      <h2 className="label mb-2 mt-6">Sens d’apprentissage</h2>
      <section className="card p-4">
        <Segmented<Direction> value={settings.learnDirection} onChange={(learnDirection) => updateSettings({ learnDirection })} options={DIR_OPTS} />
        <p className="mt-3 text-xs leading-relaxed text-muted">Ordre dans lequel WIRD propose les nouvelles sourates à apprendre. Un apprentissage déjà en cours n’est pas interrompu.</p>
      </section>

      <h2 className="label mb-2 mt-6">Sens de révision</h2>
      <section className="card p-4">
        <Segmented<Direction> value={settings.direction} onChange={(direction) => updateSettings({ direction })} options={DIR_OPTS} />
        <p className="mt-3 text-xs leading-relaxed text-muted">Indépendant du sens d’apprentissage. Votre position dans la rotation est conservée : en changeant de sens, vous repartez de là où vous en êtes. Un verset mal récité ne quitte jamais la rotation.</p>
      </section>
      <p className="mt-4 text-xs leading-relaxed text-muted">Les intervalles de renforcement (lendemain, 2 jours, 4 jours, puis 7 et 21 jours) sont centralisés dans <code>src/engine/config.ts</code>.</p>
    </SubPage>
  );
}

// ------------------------------------------------------------------ Notifications
const CATS: { key: keyof NotificationPrefs; title: string; hint: string; example: string }[] = [
  { key: 'daily', title: 'Rappel quotidien', hint: 'Un rappel doux à l’heure choisie.', example: 'Votre Wird du jour est prêt, à votre rythme.' },
  { key: 'second', title: 'Deuxième rappel', hint: 'Seulement si le Wird n’a pas été commencé.', example: 'Quelques minutes suffisent aujourd’hui.' },
  { key: 'unfinished', title: 'Travail inachevé', hint: 'Le lendemain, si un travail est resté en cours.', example: 'Vous aviez commencé hier : reprenez quand vous voulez.' },
  { key: 'comeback', title: 'Message de reprise', hint: 'Après plusieurs jours d’absence, un seul message.', example: 'Bon retour quand vous serez prêt. Rien à rattraper.' },
];

export function ProfileNotifications() {
  const { settings, updateSettings } = useWird();
  const prefs = settings.notifications;
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => void getPushStatus().then(setStatus);
  useEffect(refresh, []);

  const set = <K extends keyof NotificationPrefs>(k: K, patch: Partial<NotificationPrefs[K]>) => updateSettings({ notifications: { ...prefs, [k]: { ...prefs[k], ...patch } } });
  const active = status === 'subscribed';

  const enable = async () => {
    setBusy(true);
    try {
      const s = await enableNotifications();
      setStatus(s);
      if (s === 'granted-local') toast('Autorisation accordée');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title="Notifications" back="/profil">
      <StatusCard status={status} busy={busy} onEnable={enable} onDisable={async () => setStatus(await disableNotifications())} onTest={async () => toast((await sendLocalTest()) ? 'Notification de test envoyée' : 'Impossible d’afficher la notification')} />

      <h2 className="label mb-2 mt-6">Catégories</h2>
      <ul className="card divide-y divide-line/60">
        {CATS.map((c) => {
          const p = prefs[c.key];
          return (
            <li key={c.key} className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{c.hint}</p>
                </div>
                <Toggle label={c.title} checked={p.enabled} onChange={(enabled) => set(c.key, { enabled } as never)} />
              </div>
              {p.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Heure
                    <input type="time" className="input !min-h-[40px] !w-auto !px-3" value={p.time} onChange={(e) => e.target.value && set(c.key, { time: e.target.value } as never)} />
                  </label>
                  {c.key === 'comeback' && (
                    <label className="flex items-center gap-2 text-sm text-muted">
                      après
                      <select className="input !min-h-[40px] !w-auto !px-3" value={prefs.comeback.afterDays} onChange={(e) => set('comeback', { afterDays: +e.target.value })}>
                        {[2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} jours</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs italic text-muted">« {c.example} »</p>
            </li>
          );
        })}
      </ul>

      <h2 className="label mb-2 mt-6">Nos règles</h2>
      <ul className="card space-y-2 p-4 text-sm leading-relaxed text-muted">
        <li>• Les relances s’arrêtent dès que vous reprenez votre activité.</li>
        <li>• Jamais de message culpabilisant, jamais de rappel inutile.</li>
        <li>• Vous choisissez les horaires et pouvez désactiver chaque catégorie.</li>
        <li>• L’autorisation n’est demandée que lorsque vous touchez « Activer les rappels ».</li>
      </ul>

      <div className="mt-6 rounded-2xl border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
        <p className="mb-1 font-semibold text-ink">État du serveur de rappels</p>
        {serverConfigured ? (
          <p>Serveur configuré. {active ? 'Votre appareil est abonné : vos réglages sont synchronisés dès que la connexion le permet.' : 'Activez les rappels ci-dessus pour abonner cet appareil.'}</p>
        ) : (
          <p>Le serveur d’envoi (Cloudflare Workers + D1 + Cron) n’est <b>pas encore configuré</b> dans cette version. Vos réglages sont enregistrés sur l’appareil, mais <b>aucune notification automatique ne sera envoyée</b> tant que le serveur n’est pas déployé. Voir <code>docs/NOTIFICATIONS.md</code>.</p>
        )}
      </div>
    </SubPage>
  );
}

function StatusCard({ status, busy, onEnable, onDisable, onTest }: { status: PushStatus | null; busy: boolean; onEnable: () => void; onDisable: () => void; onTest: () => void }) {
  if (!status) return <div className="card h-28 animate-pulse" />;
  const info: Record<PushStatus, { icon: React.ReactNode; title: string; text: string }> = {
    unsupported: { icon: <BellOff />, title: 'Non pris en charge', text: 'Ce navigateur ne permet pas les notifications. Essayez Safari (iPhone, après installation) ou Chrome.' },
    'needs-install': { icon: <TriangleAlert />, title: 'Installation requise', text: 'Sur iPhone, les notifications ne fonctionnent que si WIRD est installé : Partager › Sur l’écran d’accueil, puis rouvrez WIRD depuis l’icône.' },
    denied: { icon: <BellOff />, title: 'Autorisation refusée', text: 'Les notifications sont bloquées pour WIRD. Autorisez-les dans les réglages de votre appareil ou du navigateur, puis revenez ici.' },
    off: { icon: <Bell />, title: 'Rappels désactivés', text: 'Aucune notification ne sera affichée. L’autorisation sera demandée seulement si vous le souhaitez.' },
    'granted-local': { icon: <TriangleAlert />, title: 'Autorisé — serveur non configuré', text: 'Votre appareil peut afficher des notifications, mais les rappels automatiques ne sont pas encore actifs : le serveur d’envoi n’est pas configuré. Vous pouvez tester l’affichage ci-dessous.' },
    'granted-unsubscribed': { icon: <Bell />, title: 'Autorisé, abonnement à finaliser', text: 'Touchez « Activer les rappels » pour abonner cet appareil.' },
    subscribed: { icon: <CheckCircle2 />, title: 'Rappels activés', text: 'Cet appareil est abonné aux rappels, selon vos réglages ci-dessous.' },
  };
  const i = info[status];
  const canEnable = status === 'off' || status === 'granted-unsubscribed';
  return (
    <section className="card p-5">
      <div className="flex gap-3">
        <span className={status === 'subscribed' ? 'text-good' : status === 'denied' || status === 'unsupported' ? 'text-alert' : 'text-primary'}>{i.icon}</span>
        <div>
          <p className="font-semibold">{i.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{i.text}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canEnable && <button className="btn-primary min-h-[44px]" onClick={onEnable} disabled={busy}>Activer les rappels</button>}
        {(status === 'granted-local' || status === 'subscribed') && <button className="btn-soft min-h-[44px]" onClick={onTest}>Envoyer une notification de test</button>}
        {status === 'subscribed' && <button className="btn-ghost min-h-[44px]" onClick={onDisable}>Désactiver</button>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Données
export function ProfileData() {
  const { exportData, importData, resetAll, profile } = useWird();
  const file = useRef<HTMLInputElement>(null);
  const [reset, setReset] = useState(false);

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
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    const r = importData(await f.text());
    toast(r.ok ? 'Sauvegarde restaurée' : r.error);
  };

  return (
    <SubPage title="Données et confidentialité" back="/profil">
      <section className="card p-5 text-sm leading-relaxed text-muted">
        <p className="mb-2 font-semibold text-ink">Vos données vous appartiennent</p>
        <ul className="space-y-1.5">
          <li>• Tout est enregistré <b>sur cet appareil</b> (IndexedDB). Aucun compte, aucune publicité, aucun suivi.</li>
          <li>• Si vous activez les rappels, seuls l’abonnement de notification, vos horaires, votre fuseau et la date de votre dernière activité sont transmis au serveur de rappels. Jamais vos versets ni vos évaluations.</li>
          <li>• Pensez à exporter une sauvegarde : si l’appareil ou le navigateur est réinitialisé, les données locales peuvent être perdues.</li>
        </ul>
      </section>
      <h2 className="label mb-2 mt-6">Sauvegarde</h2>
      <div className="flex flex-col gap-2">
        <button className="btn-outline" onClick={doExport}><Download size={18} /> Exporter mes données (JSON)</button>
        <button className="btn-outline" onClick={() => file.current?.click()}><Upload size={18} /> Restaurer une sauvegarde</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <h2 className="label mb-2 mt-6">Remise à zéro</h2>
      <p className="mb-3 text-sm text-muted">{profile.demo ? 'Vous utilisez des données de démonstration. ' : ''}Efface définitivement tout ce qui est enregistré sur cet appareil : mémorisation, historique, objectifs et réglages.</p>
      <button className="btn-danger w-full" onClick={() => setReset(true)}>Effacer toutes les données</button>
      <ConfirmSheet open={reset} onClose={() => setReset(false)} title="Tout effacer ?" message="Cette action est définitive. Pensez à exporter une sauvegarde avant. WIRD repartira de l’écran de bienvenue." confirmLabel="Effacer définitivement" danger onConfirm={() => void resetAll()} />
    </SubPage>
  );
}

// ------------------------------------------------------------------ À propos
export function ProfileAbout() {
  return (
    <SubPage title="À propos de WIRD" back="/profil">
      <section className="card p-5">
        <p className="font-display text-3xl font-semibold text-primary">WIRD</p>
        <p className="text-sm text-muted">Version {APP_VERSION}</p>
        <p className="mt-4 text-[15px] leading-relaxed">WIRD aide à entretenir la mémorisation du Coran : la régularité plutôt que la quantité, la consolidation plutôt que l’accumulation, l’encouragement plutôt que la culpabilisation.</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">L’application ne vous écoute pas et n’enregistre rien : vous récitez de mémoire, avec votre propre Mushaf, puis vous évaluez honnêtement votre récitation.</p>
      </section>
      <h2 className="label mb-2 mt-6">Sources et crédits</h2>
      <ul className="card space-y-2 p-5 text-sm leading-relaxed text-muted">
        <li><b className="text-ink">Texte coranique</b> : <i>Tanzil Quran Text (Uthmani, version 1.0.2)</i>, © 2008-2010 <a className="font-semibold text-primary underline" href="http://tanzil.net" target="_blank" rel="noreferrer">Tanzil.net</a>, licence Creative Commons Attribution 3.0. Texte reproduit sans modification ; seule la Basmala, écrite en tête du verset 1 dans le fichier source, est séparée pour conserver la numérotation exacte des versets. Mises à jour : tanzil.net/updates.</li>
        <li><b className="text-ink">Noms des sourates</b> (translittération, titres français) : paquet <i>quran-json</i> (CC BY 4.0).</li>
        <li><b className="text-ink">Hizb et pages du Mushaf de Médine</b> : paquet <i>quran-meta</i> (MIT).</li>
        <li><b className="text-ink">Polices</b> : Manrope, Playfair Display, Scheherazade New (SIL OFL).</li>
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">Le texte affiché sert d’aide à la mémorisation. Pour une récitation exacte, référez-vous toujours à un Mushaf imprimé et à un enseignant qualifié.</p>
    </SubPage>
  );
}
