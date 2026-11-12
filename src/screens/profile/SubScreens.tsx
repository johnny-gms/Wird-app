import { Bell, BellOff, CheckCircle2, CircleDashed, TriangleAlert, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SubPage, Toggle, cx, toast } from '@/components/ui';
import type { NotificationPrefs } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { isIOS, isStandalone } from '@/lib/pwa';
import { APP_VERSION } from '@/lib/version';
import { checkServer, disableNotifications, enableNotifications, getPushStatus, sendLocalTest, sendServerTest, serverConfigured, type PushStatus, type ServerHealth } from '@/notifications/client';
import { useWird } from '@/store/useWird';

// ------------------------------------------------------------------ Rappels
const CATS: { key: keyof NotificationPrefs; title: string; hint: string; example: string }[] = [
  { key: 'daily', title: 'Rappel quotidien', hint: 'Un rappel doux à l’heure choisie.', example: 'Ton programme est prêt, à ton rythme.' },
  { key: 'second', title: 'Deuxième rappel', hint: 'Seulement si le Wird n’a pas été commencé.', example: 'Quelques minutes suffisent aujourd’hui.' },
  { key: 'unfinished', title: 'Travail inachevé', hint: 'Le lendemain, si un travail est resté en cours.', example: 'Tu avais commencé hier : reprends quand tu veux, sans pression.' },
  { key: 'comeback', title: 'Message de retour', hint: 'Après plusieurs jours d’absence, un seul message.', example: 'Rien à rattraper : ton Wird reprend simplement là où tu l’avais laissé.' },
];

export function ProfileNotifications() {
  const { settings, updateSettings } = useWird();
  const prefs = settings.notifications;
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void getPushStatus().then(setStatus), []);
  useEffect(refresh, [refresh]);

  const set = <K extends keyof NotificationPrefs>(k: K, patch: Partial<NotificationPrefs[K]>) => updateSettings({ notifications: { ...prefs, [k]: { ...prefs[k], ...patch } } });

  const enable = async () => {
    setBusy(true);
    try {
      const s = await enableNotifications();
      setStatus(s);
      haptic(s === 'subscribed' || s === 'granted-local' ? 'success' : 'warning');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title="Rappels" back="/profil">
      <StatusCard status={status} busy={busy} onEnable={enable} onDisable={async () => { setStatus(await disableNotifications()); }} onTest={async () => toast((await sendLocalTest()) ? 'Notification de test envoyée' : 'Impossible d’afficher la notification')} />

      <h2 className="label mb-2 mt-6">Quatre rappels indépendants</h2>
      <ul className="card divide-y divide-line">
        {CATS.map((c) => {
          const p = prefs[c.key];
          return (
            <li key={c.key} className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{c.hint}</p>
                </div>
                <Toggle label={c.title} checked={p.enabled} onChange={(enabled) => { haptic('select'); set(c.key, { enabled } as never); }} />
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
        <li>• Les relances s’arrêtent dès que tu reprends ton activité.</li>
        <li>• Jamais de message culpabilisant, jamais de rappel inutile.</li>
        <li>• Tu choisis les horaires et tu peux désactiver chaque rappel.</li>
        <li>• L’autorisation n’est demandée que lorsque tu touches « Activer les rappels ».</li>
      </ul>

      <Dashboard status={status} onChanged={refresh} />
    </SubPage>
  );
}

function StatusCard({ status, busy, onEnable, onDisable, onTest }: { status: PushStatus | null; busy: boolean; onEnable: () => void; onDisable: () => void; onTest: () => void }) {
  if (!status) return <div className="card h-28 animate-pulse" />;
  const info: Record<PushStatus, { icon: React.ReactNode; title: string; text: string }> = {
    unsupported: { icon: <BellOff />, title: 'Non pris en charge', text: 'Ce navigateur ne permet pas les notifications. Essaie Safari (iPhone, après installation) ou Chrome.' },
    'needs-install': { icon: <TriangleAlert />, title: 'Installation requise', text: 'Sur iPhone, les notifications ne fonctionnent que si WIRD est installé : Partager › Sur l’écran d’accueil, puis rouvre WIRD depuis l’icône.' },
    denied: { icon: <BellOff />, title: 'Autorisation refusée', text: 'Les notifications sont bloquées pour WIRD. Autorise-les dans les réglages de ton appareil ou du navigateur, puis reviens ici.' },
    off: { icon: <Bell />, title: 'Rappels désactivés', text: 'Aucune notification ne sera affichée. L’autorisation sera demandée seulement si tu le souhaites.' },
    'granted-local': { icon: <TriangleAlert />, title: 'Autorisé — serveur non configuré', text: 'Ton appareil peut afficher des notifications, mais les rappels automatiques ne sont pas actifs : le serveur d’envoi n’est pas configuré (voir le tableau de bord ci-dessous).' },
    'granted-unsubscribed': { icon: <Bell />, title: 'Autorisé, abonnement à finaliser', text: 'Touche « Activer les rappels » pour abonner cet appareil.' },
    subscribed: { icon: <CheckCircle2 />, title: 'Rappels activés', text: 'Cet appareil est abonné aux rappels, selon tes réglages ci-dessous.' },
  };
  const i = info[status];
  const canEnable = status === 'off' || status === 'granted-unsubscribed';
  return (
    <section className="card p-4">
      <div className="flex gap-3">
        <span className={status === 'subscribed' ? 'text-good' : status === 'denied' || status === 'unsupported' ? 'text-alert' : 'text-primary'}>{i.icon}</span>
        <div>
          <p className="font-semibold">{i.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{i.text}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canEnable && <button className="btn-primary !min-h-[44px]" onClick={onEnable} disabled={busy}>Activer les rappels</button>}
        {(status === 'granted-local' || status === 'subscribed') && <button className="btn-soft !min-h-[44px]" onClick={onTest}>Test local</button>}
        {status === 'subscribed' && <button className="btn-ghost !min-h-[44px]" onClick={onDisable}>Désactiver</button>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Tableau de bord de configuration
type Check = { id: string; label: string; state: 'ok' | 'todo' | 'unknown'; detail?: string; todo?: React.ReactNode };

/**
 * Ce que l'application peut réellement vérifier (variables, serveur joignable, clé VAPID, Cron, installation, autorisation,
 * abonnement) et ce que l'utilisateur doit faire lui-même dans Cloudflare. Rien n'est affiché « ok » sans vérification réelle.
 */
function Dashboard({ status, onChanged }: { status: PushStatus | null; onChanged: () => void }) {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [test, setTest] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'no-identity'>('idle');
  const run = useCallback(() => void checkServer().then(setHealth), []);
  useEffect(run, [run]);

  const cronAge = health?.lastCron ? (Date.now() - new Date(health.lastCron).getTime()) / 60000 : null;
  const checks: Check[] = [
    {
      id: 'vars',
      label: 'Variables de l’application',
      state: serverConfigured ? 'ok' : 'todo',
      detail: serverConfigured ? 'VITE_PUSH_API_URL et VITE_VAPID_PUBLIC_KEY présentes dans ce build.' : undefined,
      todo: <>Cloudflare Pages › ton projet › <b>Settings › Variables and secrets</b> : ajoute <code>VITE_PUSH_API_URL</code> (URL du Worker) et <code>VITE_VAPID_PUBLIC_KEY</code> (clé publique), puis relance un déploiement.</>,
    },
    {
      id: 'server',
      label: 'Serveur de rappels joignable',
      state: !serverConfigured ? 'todo' : health === null ? 'unknown' : health.reachable ? 'ok' : 'todo',
      detail: health?.reachable ? 'Le Worker répond (/api/health).' : undefined,
      todo: <>Déploie le Worker : <code>npx wrangler deploy</code> depuis le dossier <code>worker/</code>, puis vérifie l’URL dans Cloudflare › Workers &amp; Pages › <b>wird-push</b>. Vérifie aussi <code>ALLOWED_ORIGIN</code> (l’adresse exacte de l’app).</>,
    },
    {
      id: 'key',
      label: 'Clé VAPID identique des deux côtés',
      state: health?.keyMatches === true ? 'ok' : health?.keyMatches === false ? 'todo' : 'unknown',
      todo: <>La clé publique du Worker (secret <code>VAPID_PUBLIC_KEY</code>) doit être identique à <code>VITE_VAPID_PUBLIC_KEY</code>. Régénère un couple avec <code>node scripts/gen-vapid.mjs</code> et mets à jour les deux.</>,
    },
    {
      id: 'cron',
      label: 'Cron actif (toutes les 15 minutes)',
      state: !health?.reachable ? 'unknown' : cronAge !== null && cronAge < 35 ? 'ok' : 'todo',
      detail: health?.lastCron ? `Dernier passage : ${new Date(health.lastCron).toLocaleString('fr-FR')}` : undefined,
      todo: <>Cloudflare › Workers &amp; Pages › <b>wird-push</b> › <b>Settings › Trigger Events › Cron Triggers</b> : vérifie la présence de <code>*/15 * * * *</code> (elle vient de <code>wrangler.toml</code> au déploiement). Le premier passage peut prendre jusqu’à 15 minutes.</>,
    },
    {
      id: 'install',
      label: 'Application installée (iPhone)',
      state: !isIOS() || isStandalone() ? 'ok' : 'todo',
      todo: <>Safari › Partager › <b>Sur l’écran d’accueil</b>, puis ouvre WIRD depuis son icône (iOS 16.4 minimum).</>,
    },
    { id: 'perm', label: 'Autorisation du navigateur', state: status === 'subscribed' || status === 'granted-local' || status === 'granted-unsubscribed' ? 'ok' : 'todo', todo: <>Touche « Activer les rappels » ci-dessus et accepte la demande.</> },
    { id: 'sub', label: 'Cet appareil est abonné', state: status === 'subscribed' ? 'ok' : 'todo', todo: <>Touche « Activer les rappels » une fois le serveur configuré.</> },
  ];

  const sendTest = async () => {
    setTest('sending');
    const r = await sendServerTest();
    setTest(r === 'sent' ? 'sent' : r);
    onChanged();
  };

  return (
    <section className="mt-6" aria-labelledby="dash">
      <h2 id="dash" className="label mb-2">Tableau de bord de configuration</h2>
      <div className="card p-4">
        <p className="text-sm text-muted">Les rappels automatiques demandent un petit serveur (Cloudflare Workers + D1 + Cron) que <b>toi seul</b> peux activer depuis ton compte. WIRD vérifie ci-dessous ce qui peut l’être et te dit exactement quoi faire pour le reste.</p>
        <ul className="mt-3 space-y-3">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-3">
              {c.state === 'ok' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-good" /> : c.state === 'todo' ? <XCircle size={20} className="mt-0.5 shrink-0 text-hard" /> : <CircleDashed size={20} className="mt-0.5 shrink-0 text-muted" />}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{c.label}</p>
                {c.state === 'ok' && c.detail && <p className="text-muted">{c.detail}</p>}
                {c.state === 'unknown' && <p className="text-muted">Non vérifiable pour le moment (serveur non configuré ou injoignable).</p>}
                {c.state === 'todo' && <p className="mt-0.5 leading-relaxed text-muted"><b className="text-ink">À faire :</b> {c.todo}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-soft !min-h-[40px] text-sm" onClick={run}>Revérifier</button>
          <button className={cx('btn-primary !min-h-[40px] text-sm')} disabled={status !== 'subscribed' || test === 'sending'} onClick={sendTest}>Envoyer un test depuis le serveur</button>
        </div>
        {test === 'sent' && <p className="mt-2 text-sm text-good">Le serveur a envoyé la notification. Tu devrais la recevoir dans quelques secondes — si ce n’est pas le cas, vérifie l’autorisation dans les réglages de l’appareil.</p>}
        {test === 'failed' && <p className="mt-2 text-sm text-alert">Le serveur n’a pas pu envoyer la notification (abonnement expiré ou clé VAPID incorrecte). Désactive puis réactive les rappels.</p>}
        {test === 'no-identity' && <p className="mt-2 text-sm text-alert">Cet appareil n’est pas encore enregistré auprès du serveur : réactive les rappels.</p>}
        <p className="mt-3 text-xs text-muted">Procédure complète : <code>docs/NOTIFICATIONS.md</code>. Seuls l’abonnement Push, tes horaires, ton fuseau et la date de ta dernière activité sont transmis au serveur : jamais tes versets ni tes évaluations.</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ À propos
export function ProfileAbout() {
  return (
    <SubPage title="À propos de WIRD" back="/profil">
      <section className="card p-5">
        <p className="font-display text-3xl font-semibold text-primary">WIRD</p>
        <p className="text-sm text-muted">Version {APP_VERSION}</p>
        <p className="mt-4 text-[15px] leading-relaxed">WIRD t’aide à entretenir ta mémorisation du Coran : la régularité plutôt que la quantité, la consolidation plutôt que l’accumulation, l’encouragement plutôt que la culpabilisation.</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">L’application ne t’écoute pas et n’enregistre rien : tu récites de mémoire, avec ton Coran papier ou le Coran numérique de WIRD, puis tu évalues honnêtement ton travail à la fin de la séance.</p>
      </section>
      <h2 className="label mb-2 mt-6">Sources et crédits</h2>
      <ul className="card space-y-2 p-5 text-sm leading-relaxed text-muted">
        <li><b className="text-ink">Texte coranique</b> : <i>Tanzil Quran Text (Uthmani Minimal, version 1.1)</i>, © 2007-2026 Tanzil Project, <a className="font-semibold text-primary underline" href="http://tanzil.net" target="_blank" rel="noreferrer">Tanzil.net</a>, licence Creative Commons Attribution 3.0. Texte reproduit sans aucune modification (la Basmala est portée par un attribut distinct dans le fichier source, la numérotation des versets est exacte). Hizb et pages : métadonnées Tanzil v1.0. Mises à jour : tanzil.net/updates.</li>
        <li><b className="text-ink">Noms des sourates</b> (translittération, titres français) : paquet <i>quran-json</i> (CC BY 4.0).</li>
        <li><b className="text-ink">Recoupement des Hizb et pages</b> : paquet <i>quran-meta</i> (MIT).</li>
        <li><b className="text-ink">Police du texte coranique</b> : Amiri Quran (SIL OFL). Interface : polices système.</li>
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">Le texte affiché sert d’aide à la mémorisation. Pour une récitation exacte, réfère-toi toujours à un Mushaf imprimé et à un enseignant qualifié.</p>
    </SubPage>
  );
}
