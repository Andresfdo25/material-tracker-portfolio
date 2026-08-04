// installBarTone.ts — el color de las barras de instalación del timeline (lote 74,
// POR PROYECTO desde el lote 75).
//
// UNA preferencia de UI por proyecto — no es dato de dominio: vive en localStorage
// (`installBarColor:<projectId>`, via persist.ts) como las columnas ocultas o el filtro
// de Alerts, nunca en el Db ni en un snapshot. La lee el Overview al montarse (las
// pantallas se montan de a una, mismo argumento que alertsFilter.ts) y la escribe el
// popover de la barra en el timeline (lote 75 — antes una muestra global en la leyenda;
// la clave global vieja `installBarColor` simplemente se abandonó, reelegir es un click).
//
// Seis opciones, cada una un par pastel (fill, theme-flat, ya existente) + tinta (borde,
// con su valor de dark en colors.css — medidos ≥4.5:1 contra el canvas y la zebra en los
// dos temas). La ALARMA (overdue / installing on material not on site) siempre pisa el
// color elegido con `--alert-ink`: una preferencia nunca puede apagar la alarma.
//
// En un .ts y no en el componente por el fast-refresh, como overviewRows.ts.
import { loadJSON, saveJSON } from '../store/persist';

export interface InstallBarTone { key: string; label: string; fill: string; ink: string }

export const INSTALL_BAR_TONES: readonly InstallBarTone[] = [
  { key: 'teal', label: 'Install teal (default)', fill: 'var(--status-installed)', ink: 'var(--ib-teal-ink)' },
  { key: 'blue', label: 'Blue', fill: 'var(--mos-blue-soft)', ink: 'var(--ib-blue-ink)' },
  { key: 'violet', label: 'Violet', fill: 'var(--mos-violet-soft)', ink: 'var(--ib-violet-ink)' },
  { key: 'magenta', label: 'Magenta', fill: 'var(--mos-magenta-soft)', ink: 'var(--ib-magenta-ink)' },
  { key: 'orange', label: 'Orange', fill: 'var(--mos-orange-soft)', ink: 'var(--ib-orange-ink)' },
  { key: 'green', label: 'Green', fill: 'var(--mos-aqua-soft)', ink: 'var(--ib-green-ink)' },
];

/** La clave de localStorage de la preferencia, POR PROYECTO (lote 75 — antes era una
 * global; la vieja `installBarColor` simplemente se abandona, reelegir es un click).
 * Una sola función construye la clave para los dos lados. */
export function installBarColorKey(projectId: string): string {
  return `installBarColor:${projectId}`;
}

export const DEFAULT_INSTALL_BAR_TONE: InstallBarTone = INSTALL_BAR_TONES[0];

/** Clave desconocida (una base vieja, un typo a mano) cae al default, nunca rompe. */
export function installBarToneOf(key: string | null | undefined): InstallBarTone {
  return INSTALL_BAR_TONES.find((t) => t.key === key) ?? DEFAULT_INSTALL_BAR_TONE;
}

export function loadInstallBarTone(projectId: string): InstallBarTone {
  return installBarToneOf(loadJSON<string>(installBarColorKey(projectId)));
}

export function saveInstallBarTone(projectId: string, key: string): void {
  saveJSON(installBarColorKey(projectId), key);
}
