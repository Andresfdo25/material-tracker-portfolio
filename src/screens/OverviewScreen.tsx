// OverviewScreen.tsx — portfolio pivot across projects (report snapshots): the status
// matrix, a Req.-Date timeline (one lane per project), and the Buy-By table grouped
// by project → work package with item counts. All read published report snapshots.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../store/useApp';
import { awaitingInstall, backorderQty, closesAtSite, computeItem, daysLate, daysWaiting, deliveryWatch, fieldMeasurePending, fmtLong, fmtMD, fmtMDY, groupByPackage, hasOpenBackorder, installUrgency, isClosed, itemStage, logDrivesStage, MOSAIC_BADGE_META, mosaicCards, packageReadiness, parseISO, pendingInstallQty, projectClosesAtSite, readinessMark, readinessRank, stageMoves, submittalBlockers, today, totalQty, waitSeverity, type InstallUrgency, type MosaicBadgeKey, type MosaicCard, type PkgReadiness, type StageMoves, type WaitSeverity } from '../store/logic';
import type { ComputedItem, ItemStage, ItemStatus, MaterialItem, Project, ReportSnapshot, WorkPackage } from '../store/types';
import { StatusBadge } from '../components/ds/StatusBadge';
import { Button } from '../components/ds/Button';
import { Modal } from '../components/ds/Modal';
import { InstallMosaic } from '../components/InstallMosaic';
import { presetListFilter } from '../store/listFilter';
import { LateDeliveriesModal, PartialDeliveryModal, AwaitingCloseModal } from '../components/OverviewClockModals';
import { PackageCloseOutModal, type PackageItemRow } from '../components/PackageCloseOutModal';
import type { MoveTarget } from '../components/StageMoveButtons';
import { ItemQuickEditModal, type QuickEditPatch, type QuickEditRow, type QuickEditVariant } from '../components/ItemQuickEditModal';
import { ConfirmDateModal, type DatePrompt } from '../components/ConfirmDateModal';
import { card, td, tdL, th, thL } from '../components/ds/overviewTable';

export interface Enriched {
  i: MaterialItem;
  pkg: WorkPackage;
  projectId: string;
  c: ComputedItem;
  r: ReportSnapshot;
  /** Package scope — supply only closes at 📍 on-site instead of 🔩 installed. */
  supplyOnly: boolean;
}

/* status urgency — for picking the most-pressing badge in a grouped row */
const STATUS_RANK: Record<ItemStatus, number> = {
  'order-now': 6, 'order-soon': 5, 'needs-data': 4, planned: 3, ordered: 2, partial: 1, delivered: 0, na: -1, 'on-site': -2, installed: -2,
};

/* Install urgency → sort weight for the stage tables (worst first). */
const URGENCY_RANK: Record<InstallUrgency, number> = { overdue: 3, 'due-soon': 2, unscheduled: 1, scheduled: 0 };

/* One work package of the Detailed table under Delivery and installation status — every
 * package with published items, not only the ones with material already in hand (see
 * `stageGroups`). `closed` counts the items that reached the package's closing stage,
 * `open` the ones that haven't, and `awaiting` the subset of those that is already here
 * and waiting — the three numbers the bar draws. */
interface StageGroup {
  key: string; projectId: string; projectName: string; wpId: string; wpLabel: string;
  items: number; warehouse: number; site: number; closed: number; awaiting: number; open: number;
  /** 🔩 installed — `null` on a supply-only package, where the column doesn't apply (that
   * scope closes when it reaches the jobsite, and somebody else does the installing). */
  installed: number | null;
  nextOnsite: string; urgency: InstallUrgency; itemId: string;
  /** Longest wait among the items still short of the closing stage — the aging signal the
   * Waiting column prints. */
  waited: number | null;
  /** The group's own rows, oldest wait first — what the drill-down modal lists. Carried
   * here rather than re-derived: this is a render-time view model, never persisted. */
  rows: Enriched[];
  supplyOnly: boolean;
}
interface ProjBlock { projectId: string; projectName: string; packages: StageGroup[]; open: number; closed: number }

/** One ⏰ late delivery — a row per ITEM, because the ways out of it are decisions about
 * one item: reschedule the promised date, or say where the material actually ended up.
 * That second half used to be a single "it arrived" that meant 🏭 warehouse and nothing
 * else — a truck three weeks late often unloads straight at the jobsite, and forcing that
 * through the warehouse recorded something that didn't happen. It's now the same
 * three-stage group the mosaic's package window offers. */
export interface LateRow {
  key: string; projectId: string; projectName: string; wpId: string; wpLabel: string; itemId: string;
  description: string; vendor: string; po: string; promised: string; behind: number;
  stage: ItemStage;
  /** Supply only → 📍 on site IS the close-out, and 🔩 is not offered. */
  supplyOnly: boolean;
  /** Which stage writes would land, resolved against the live draft (`stageMoves`). */
  moves: StageMoves;
}

/** Packages under a project header row. Projects keep the worst-first order of their most
 * urgent package (first appearance in the rows), not alphabetical. */
function groupByProject(rows: StageGroup[]): ProjBlock[] {
  const m = new Map<string, StageGroup[]>();
  rows.forEach((g) => { const a = m.get(g.projectId); if (a) a.push(g); else m.set(g.projectId, [g]); });
  return [...m.values()].map((gs) => ({
    projectId: gs[0].projectId,
    projectName: gs[0].projectName,
    packages: gs,
    open: gs.reduce((s, g) => s + g.open, 0),
    closed: gs.reduce((s, g) => s + g.closed, 0),
  }));
}

/** Progress toward the scope's CLOSING stage, with the counts printed inside the bar:
 * solid = closed (installed, or on-site for a supply-only package), light = received but
 * not closed yet, track = not in hand. The count is dropped from a segment too narrow to
 * hold it — the tooltip always has it. */
function InstallBar({ closed, awaiting, total, title, tone = 'install' }: { closed: number; awaiting: number; total: number; title: string; tone?: 'install' | 'site' }) {
  const solid = tone === 'site' ? 'var(--status-on-site-ink)' : 'var(--status-installed-ink)';
  const light = tone === 'site' ? 'var(--status-on-site)' : 'var(--status-installed)';
  const instPct = total ? (closed / total) * 100 : 0;
  const awaitPct = total ? (awaiting / total) * 100 : 0;
  // Segment widths stay honest (no minimum width fudging), so whether a count fits is a
  // question of real pixels — measure the track instead of guessing from percentages.
  // A segment too narrow for its number renders blank; the % label and the tooltip
  // still carry the value.
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackW(el.offsetWidth);
    // Re-measure on resize: at a narrow viewport the halves stack and the bar grows,
    // so labels that didn't fit before should reappear.
    const ro = new ResizeObserver(([e]) => setTrackW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fits = (pct: number, n: number) => n > 0 && (trackW * pct) / 100 >= String(n).length * 8 + 6;
  const seg = (pct: number, bg: string, ink: string): CSSProperties => ({
    width: `${pct}%`, height: '100%', background: bg, color: ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    font: 'var(--text-mono-sm)', fontWeight: 700, overflow: 'hidden',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={title}>
      <div ref={trackRef} style={{ flex: 1, display: 'flex', height: 20, minWidth: 84, background: 'var(--surface-strong)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={seg(instPct, solid, '#ffffff')}>{fits(instPct, closed) ? closed : ''}</div>
        <div style={seg(awaitPct, light, solid)}>{fits(awaitPct, awaiting) ? awaiting : ''}</div>
      </div>
      <span style={{ font: 'var(--text-mono-sm)', color: instPct === 100 ? solid : 'var(--muted)', minWidth: 34, textAlign: 'right' }}>
        {Math.round(instPct)}%
      </span>
    </div>
  );
}

/* Submittal blocker categories (Overview tile breakdown). */
const BLOCK_CATS = ['Product data', 'Samples', 'Shop drawings', 'Field measurements', 'Other'] as const;
/* Los mismos nombres, acortados para el ÚNICO renglón que le cabe al gauge ⛔ del riel. El
   desglose completo de las cinco categorías vive en su tooltip y en Submittals, que es
   adonde lleva el click. */
const BLOCK_SHORT: Record<string, string> = {
  'Product data': 'Product data', Samples: 'Samples', 'Shop drawings': 'Shop dwgs',
  'Field measurements': 'Field meas.', Other: 'Other',
};

/* Every section title on the dashboard, in one place — the display face is 400 by
   default and at 20px it read lighter than the tables under it. */
const sectionTitle: CSSProperties = { font: 'var(--text-title-md)', fontWeight: 700, color: 'var(--title)' };

// card / th / thL / td / tdL now live in components/ds/overviewTable.ts (imported below),
// shared with the gauge modals in OverviewClockModals.tsx — a file that exports a
// component plus plain constants trips the fast-refresh lint rule.

/* ------------------------------------------------------------------ board chrome */

/* Los rótulos y el número de un tile — a nivel de módulo para que `Gauge` los pueda leer. */
const tileLabel: CSSProperties = { font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const tileNum: CSSProperties = { font: 'var(--text-display-md)', color: 'var(--title)', fontWeight: 600, lineHeight: 1.1 };

/* El rótulo chico y ruleado que nombra una BANDA (un grupo de tarjetas) y, dentro del riel,
   el reloj al que pertenece un grupo de gauges. Versalitas con tracking para que se lea
   como etiqueta y nunca compita con el título de una sección. */
const eyebrow: CSSProperties = {
  font: 'var(--text-caption)', fontWeight: 700, letterSpacing: 0.9,
  textTransform: 'uppercase', color: 'var(--muted)',
};

/** Una banda: el rótulo sobre una regla y, debajo, sus tarjetas. Todo lo que está bajo el
 * timeline es una de estas, así que bajar por la pantalla es recorrer un índice. */
function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div style={{ ...eyebrow, paddingBottom: 6, marginBottom: 14, borderBottom: '2px solid var(--border-strong)' }}>{label}</div>
      {children}
    </section>
  );
}

/** El encabezado de UNA tarjeta: título a la izquierda, controles alineados a la derecha
 * sobre ESA MISMA línea, y la bajada de una línea abajo. El `minHeight` de la fila del
 * título es lo que sostiene la alineación entre columnas: una tarjeta con botones y otra
 * sin ellos arrancan su tabla a la misma altura. */
function SectionHead({ icon, title, caption, captionTitle, right }: {
  icon?: string; title: string; caption?: ReactNode; captionTitle?: string; right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 30 }}>
        <div style={sectionTitle}>{icon ? `${icon} ` : ''}{title}</div>
        <span style={{ flex: 1, minWidth: 0 }} />
        {right}
      </div>
      {caption != null && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }} title={captionTitle}>
          {caption}
        </div>
      )}
    </div>
  );
}

/** Una línea de la bajada de un gauge. `tone` solo lo usan las de alarma. */
interface GaugeLine { text: string; tone?: string }

interface GaugeProps {
  icon: string;
  label: string;
  value: number;
  /** Las dos líneas bajo el número. La segunda casi siempre viene vacía y el hueco se
   * reserva igual — ver el `minHeight` de abajo. */
  lines: [GaugeLine, GaugeLine?];
  /** La tapa de 4px: el color del estado. Vacío = en calma. */
  accent?: string;
  /** Relleno del semáforo A PLENO para los dos que son alarma pura (🔴 y 🟠), con su propia
   * tinta: los pasteles no se re-declaran en dark, así que `--title` encima sería ilegible. */
  fill?: string;
  ink?: string;
  title: string;
  onClick: () => void;
}

/** Una celda del riel de indicadores. La forma es idéntica en las siete: tapa de color,
 * rótulo, número, y DOS ranuras de bajada — la segunda suele estar vacía y se reserva
 * igual, para que el riel no cambie de alto cada vez que se resuelve la última alarma. */
function Gauge({ icon, label, value, lines, accent, fill, ink, title, onClick }: GaugeProps) {
  return (
    <button
      type="button"
      className="ov-gauge"
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0,
        textAlign: 'left', border: 'none', padding: 0,
        background: fill ?? 'var(--canvas)', color: ink ?? 'var(--ink)', cursor: 'pointer',
      }}
    >
      <span style={{ height: 4, flex: 'none', background: accent ?? 'transparent' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 13px 13px' }}>
        <span style={{ ...tileLabel, color: ink ?? 'var(--muted)' }}>{icon} {label}</span>
        <span style={{ ...tileNum, color: ink ?? 'var(--title)' }}>{value}</span>
        {/* 38px = dos renglones de `--text-caption`. Fijo, no automático. */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2, minHeight: 38 }}>
          {[0, 1].map((n) => (
            <span
              key={n}
              style={{
                font: 'var(--text-caption)', color: lines[n]?.tone ?? ink ?? 'var(--muted)',
                fontWeight: lines[n]?.tone ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {lines[n]?.text ?? ''}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

/** Un reloj del riel. Los tres grupos SON los tres relojes del motor (CLAUDE.md /
 * ARCHITECTURE.md §4): «¿tengo que comprar?», «¿llegó o no llegó?», «¿tengo que instalar?».
 * El grupo ocupa tantas columnas del riel como gauges tiene (`.ov-rail` es una grilla de
 * siete, una por indicador), así que todos los indicadores del tablero miden lo mismo estén
 * en el grupo que estén. `minmax(0, 1fr)` y no `1fr` pelado: el `1fr` pelado es
 * `minmax(auto, 1fr)`, así que una celda con más texto que las otras se lleva más ancho. */
function ClockGroup({ label, items }: { label: string; items: GaugeProps[] }) {
  const n = items.length;
  return (
    <div style={{ ...card, gridColumn: `span ${n}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...eyebrow, padding: '7px 13px', background: 'var(--surface-soft)', borderBottom: '1px solid var(--hairline)' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, flex: 1 }}>
        {items.map((g, i) => (
          <span key={g.label} style={{ display: 'flex', borderLeft: i === 0 ? undefined : '1px solid var(--hairline)' }}>
            <Gauge {...g} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** How long an item has been sitting since it was received — read off the report, oldest
 * first everywhere it's used. Kept as one helper so the group's `waited` number and the
 * per-row drill list never disagree about what "waiting" means. */
function openWait(x: Enriched): number | null {
  return daysWaiting(x.r);
}

/** One "days waiting" cell, tinted by `waitSeverity` — a DIFFERENT question from the
 * buy-by semaphore next to it (elapsed time, not a promised date), so it gets its own
 * quieter family instead of borrowing the order-now/order-soon pastels. */
export function WaitCell({ days, cell = td }: { days: number | null; cell?: CSSProperties }) {
  const sev: WaitSeverity | null = waitSeverity(days);
  const bg = sev === 'urgent' ? 'var(--wait-late)' : sev === 'warning' ? 'var(--wait-warn)' : undefined;
  const ink = sev === 'urgent' ? 'var(--wait-late-ink)' : sev === 'warning' ? 'var(--wait-warn-ink)' : 'var(--muted)';
  return (
    <td style={{ ...cell, background: bg, color: ink, fontWeight: sev ? 700 : 400 }}>
      {days == null ? '—' : `${days}d`}
    </td>
  );
}

/** Per-item aging for one package — the answer to "which of these has been sitting
 * longest?", which the group row can only summarise with its worst number. Rows are
 * already sorted oldest-first by `stageGroups`. Covers both scopes: the finish line moves
 * (📍 on site for supply only, 🔩 installed otherwise), the question is the same. */
function PackageDrillModal({ group, onClose, onJumpItem }: {
  group: StageGroup;
  onClose: () => void;
  onJumpItem: (projectId: string, itemId: string) => void;
}) {
  const thD: CSSProperties = { ...th, padding: '7px 10px' };
  const tdD: CSSProperties = { ...td, padding: '8px 10px' };
  const supplyOnly = group.supplyOnly;
  const closedLabel = supplyOnly ? 'On site' : 'Installed';
  const closedInk = supplyOnly ? 'var(--status-on-site-ink)' : 'var(--status-installed-ink)';
  return (
    <Modal
      title={<span>{group.projectName} · {group.wpLabel}</span>}
      onClose={onClose}
      width={720}
    >
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        {group.items} item{group.items === 1 ? '' : 's'} in hand · {group.closed} {supplyOnly ? 'on site' : 'installed'} · {group.awaiting} awaiting {supplyOnly ? 'the jobsite' : 'installation'}.
        Click a row to open it in the Material List.
      </div>
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={{ ...thD, textAlign: 'left' }}>Description</th>
              <th style={thD}>Qty</th>
              <th style={{ ...thD, textAlign: 'left' }}>Received</th>
              <th style={{ ...thD, textAlign: 'left' }}>{closedLabel}</th>
              <th style={thD}>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {[...group.rows].sort((a, b) => (openWait(b) ?? -1) - (openWait(a) ?? -1)).map((x) => (
              <tr
                key={x.i.id}
                onClick={() => { onClose(); onJumpItem(x.projectId, x.i.id); }}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ ...tdD, textAlign: 'left', font: 'var(--text-body)' }}>{x.r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}</td>
                <td style={{ ...tdD, whiteSpace: 'nowrap' }}>{x.r.qty === '' || x.r.qty == null ? '—' : `${x.r.qty}${x.r.um ? ` ${x.r.um}` : ''}`}</td>
                <td style={{ ...tdD, textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {x.r.receivedQty ? `${x.r.receivedQty} ` : ''}
                  {x.r.receivedDate ? fmtMDY(x.r.receivedDate) : <span style={{ color: 'var(--muted)' }}>no date</span>}
                </td>
                {/* The package's own finish line, not a fixed column: on an install row the
                    on-site date is a waypoint, and printing it under a "closed out" heading
                    would call half the pending list finished. */}
                {(() => {
                  const date = supplyOnly ? x.r.siteDate : x.r.installedDate;
                  return (
                    <td style={{ ...tdD, textAlign: 'left', whiteSpace: 'nowrap', color: date ? closedInk : 'var(--muted)', fontWeight: date ? 600 : 400 }}>
                      {date ? `${supplyOnly ? '📍' : '🔩'} ${fmtMDY(date)}` : '—'}
                    </td>
                  );
                })()}
                <WaitCell days={openWait(x)} cell={tdD} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** What a mosaic badge opens — the same question the package drill-down already answers,
 * pointed at a different slice: not "everything in this package" but "everything under
 * this badge in this project". Every row is still one click from the Material List. */
function BadgeDrillModal({ card, badge, onClose, onJumpItem }: {
  card: MosaicCard;
  badge: MosaicBadgeKey;
  onClose: () => void;
  onJumpItem: (projectId: string, itemId: string) => void;
}) {
  const thD: CSSProperties = { ...th, padding: '7px 10px' };
  const tdD: CSSProperties = { ...td, padding: '8px 10px' };
  const meta = MOSAIC_BADGE_META[badge];
  const rows = card.badges.find((b) => b.key === badge)?.items ?? [];
  // The note column only exists where a badge fills it (what is still owed, which way the
  // material travelled) — an empty column on the other four would be furniture.
  const hasNote = rows.some((x) => x.note);
  // Grouped by package rather than a flat list: the list is an entire project, and the
  // package label — which repeated identically down a column of its own — is exactly where
  // the PM splits the work. Same decision, same helper as the quick edit, so the two
  // windows can't order things differently.
  const groups = groupByPackage(rows);
  const cols = 3 + (hasNote ? 1 : 0);
  return (
    <Modal
      title={<span>{card.projectName} · {meta.icon} {rows.length} {meta.label}</span>}
      onClose={onClose}
      width={760}
    >
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        Click a row to open it in the Material List.
      </div>
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={{ ...thD, textAlign: 'left' }}>Description</th>
              <th style={thD}>Qty</th>
              <th style={{ ...thD, textAlign: 'left' }}>{meta.column}</th>
              {hasNote && <th style={{ ...thD, textAlign: 'left' }}>Detail</th>}
            </tr>
          </thead>
          {groups.map((g, gi) => (
            <tbody key={g.wpId}>
              <tr>
                <th
                  colSpan={cols}
                  scope="colgroup"
                  style={{
                    ...thD, textAlign: 'left', color: 'var(--title)', fontWeight: 700,
                    background: 'var(--surface-soft)',
                    borderTop: gi > 0 ? '1px solid var(--hairline)' : undefined,
                  }}
                >
                  {g.wpLabel} · {g.rows.length} item{g.rows.length === 1 ? '' : 's'}
                </th>
              </tr>
              {g.rows.map((x) => (
                <tr
                  key={x.id}
                  onClick={() => { onClose(); onJumpItem(card.projectId, x.id); }}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...tdD, textAlign: 'left', font: 'var(--text-body)' }}>{x.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}</td>
                  <td style={{ ...tdD, whiteSpace: 'nowrap' }}>{x.qty === '' || x.qty == null ? '—' : `${x.qty}${x.um ? ` ${x.um}` : ''}`}</td>
                  <td style={{ ...tdD, textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {x.date ? fmtMDY(x.date) : <span style={{ color: 'var(--muted)' }}>no date</span>}
                  </td>
                  {hasNote && <td style={{ ...tdD, textAlign: 'left', font: 'var(--text-body)', color: 'var(--muted)' }}>{x.note || '—'}</td>}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Modal>
  );
}

/** The stage table — the tabular twin of the mosaic: every package with published items,
 * both scopes, one row each. Scope is a per-ROW property: it picks the closing stage
 * (🔩 installed / 📍 on site) and nothing else, so Detailed covers the same portfolio the
 * mosaic does.
 *
 * It used to start at "material already in hand", and called "still open" whatever had
 * something received and wasn't closed. Supply-only material usually ships straight to
 * the jobsite, which closes it on arrival — so those packages were never "still open" and
 * the default view dropped them. Now the row list is the mosaic's, and *still open* means
 * the package has items short of its finish line, wherever they physically are.
 *
 * — **Items** and **Waiting** apply to both scopes: a crate that has sat received for six
 *   weeks is just as stale when we are the ones who will install it. Waiting stays about
 *   material IN HAND — something that never arrived hasn't been waiting anywhere.
 * — **🔩 Installed** is back as a column: the bar answers "how far along", the number
 *   answers "how many are up". On a supply-only row it prints a dash — that scope closes
 *   at 📍 and somebody else does the installing.
 * — **🏭 / 📍 / 🔩** are a partition of what's here, by where it sits. On a supply-only row
 *   📍 holds the items already done (arriving IS closing out), which is why it's 🔩 that
 *   goes empty there and not both — a dash, never a zero that reads like a shortfall. */
function StageTable({ blocks, empty, collapsed, onToggle, onJumpProject, onJumpItem, onDrill }: {
  blocks: ProjBlock[];
  empty: string;
  collapsed: Record<string, boolean>;
  onToggle: (projectId: string) => void;
  onJumpProject: (projectId: string) => void;
  onJumpItem: (projectId: string, itemId: string) => void;
  /** Open the per-item aging list for one package. */
  onDrill: (g: StageGroup) => void;
}) {
  const cols = 9;
  return (
    // `overflow: auto` — nine columns, so below ~1100px local the last ones ran off the
    // box with no way to reach them.
    <div style={{ ...card, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-soft)' }}>
            <th style={thL}>Work package</th>
            <th style={th} title="Every published item in this package — click a count for the per-item list">Items</th>
            <th style={th} title="In the warehouse">🏭</th>
            <th style={th} title="On site — where the package closes on site, these are the ones already done">📍</th>
            <th style={th} title="Installed — a dash where the package is supply only and somebody else installs it">🔩</th>
            <th style={thL}>On-Site Req.</th>
            <th style={th} title="Longest wait since the material was received">Waiting</th>
            <th style={{ ...thL, width: 132 }}>Closed out</th>
            <th style={{ ...th, width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {blocks.map((proj) => (
            <Fragment key={proj.projectId}>
              <tr
                onClick={() => onToggle(proj.projectId)}
                title={collapsed[proj.projectId] ? 'Expand this project' : 'Collapse this project'}
                style={{ cursor: 'pointer', background: 'var(--surface-soft)' }}
              >
                <td colSpan={cols} style={{ ...tdL, font: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>{collapsed[proj.projectId] ? '▸' : '▾'}</span>
                    <span>{proj.projectName}</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                      {proj.packages.length} pkg · {proj.open} open · {proj.closed} closed out
                    </span>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      title={`Open ${proj.projectName}`}
                      onClick={(e) => { e.stopPropagation(); onJumpProject(proj.projectId); }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', font: 'var(--text-caption)', fontWeight: 600, padding: '2px 4px' }}
                    >
                      Open ›
                    </button>
                  </span>
                </td>
              </tr>
              {!collapsed[proj.projectId] && proj.packages.map((g) => {
                // Urgency is carried by the On-Site cell itself (full-strength pastel +
                // its own ink), not a row tint: those two tokens are theme-invariant, so
                // it stays legible in dark mode — a mixed-with-canvas tint would not.
                const tone = g.open === 0 ? undefined
                  : g.urgency === 'overdue' ? { bg: 'var(--status-order-now)', ink: 'var(--status-order-now-ink)' }
                    : g.urgency === 'due-soon' ? { bg: 'var(--status-order-soon)', ink: 'var(--status-order-soon-ink)' }
                      : g.urgency === 'unscheduled' ? { bg: 'var(--status-needs-data)', ink: 'var(--status-needs-data-ink)' }
                        : undefined;
                return (
                  <tr
                    key={g.key}
                    onClick={() => onJumpItem(g.projectId, g.itemId)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ ...tdL, color: 'var(--muted)' }}>
                      {g.wpLabel}
                      {/* Named in words, not with the 📍 glyph: that icon is a column header
                          two cells to the right meaning something else (on site, still
                          open), and the same symbol saying two things in one row is worse
                          than four extra characters. */}
                      {g.supplyOnly && (
                        <span
                          title="Supply only — this package closes when the material reaches the jobsite"
                          style={{ marginLeft: 6, font: 'var(--text-caption)', color: 'var(--status-on-site-ink)', background: 'var(--status-on-site)', borderRadius: 'var(--radius-sm)', padding: '1px 5px', whiteSpace: 'nowrap' }}
                        >
                          supply only
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {/* Ghost, not a link colour: `--link` is not re-declared for dark
                          mode and lands at 2.7:1 on the dark canvas. The resting outline
                          of `.btn--ghost` is built on currentColor, so `--ink` gives the
                          same affordance and stays legible on both themes. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        title={`${g.items} item${g.items === 1 ? '' : 's'} — see where each one stands and how long it has been waiting`}
                        onClick={(e) => { e.stopPropagation(); onDrill(g); }}
                        style={{ padding: '2px 9px', font: 'var(--text-mono)', fontWeight: 700 }}
                      >
                        {g.items}
                      </Button>
                    </td>
                    <td style={{ ...td, fontWeight: g.warehouse ? 600 : 400, color: g.warehouse ? 'var(--ink)' : 'var(--muted)' }}>{g.warehouse}</td>
                    <td style={{ ...td, color: g.site ? 'var(--ink)' : 'var(--muted)' }}>{g.site}</td>
                    {/* A dash and not a zero: on a supply-only package nobody of ours
                        installs, so a 0 there would read like a shortfall. */}
                    <td style={{ ...td, color: g.installed ? 'var(--ink)' : 'var(--muted)' }}>
                      {g.installed == null ? '—' : g.installed}
                    </td>
                    <td style={{ ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, background: tone?.bg, color: tone?.ink ?? 'var(--ink)', whiteSpace: 'nowrap' }}>
                      {g.open === 0 ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— done</span>
                        : g.nextOnsite ? `${g.urgency === 'overdue' ? '⚠ ' : ''}${fmtMDY(g.nextOnsite)}`
                          : '❔ no date'}
                    </td>
                    <WaitCell days={g.open === 0 ? null : g.waited} />
                    <td style={tdL}>
                      <InstallBar
                        closed={g.closed}
                        awaiting={g.awaiting}
                        total={g.items}
                        tone={g.supplyOnly ? 'site' : 'install'}
                        title={`${g.closed} ${g.supplyOnly ? '📍 on site' : '🔩 installed'} · ${g.awaiting} received and waiting · ${g.items - g.closed - g.awaiting} not here yet · ${g.items} items`}
                      />
                    </td>
                    <td style={{ ...td, color: 'var(--muted)', textAlign: 'center' }}>›</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {blocks.length === 0 && (
            <tr><td colSpan={cols} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ Req. timeline */

/** One package this milestone speaks for. A collapsed dot carries several. */
interface MsPackage {
  wpId: string; label: string; itemId: string;
  date: string;              // its OWN Req. date — differs from the dot's when `spread`
  readiness: PkgReadiness;   // how far all of its items have got (logic.ts)
  supplyOnly: boolean;       // decides whether 📍 is the finish line for this one
}
interface Milestone {
  date: string;      // ISO — the WP's earliest On-Site Req. (or Field Measure) date
  label: string;     // work-package label, or the collective 'All Req.' / 'N of M Req.'
  kind: 'wp' | 'all' | 'group' | 'fm'; // 'fm' = Field Measurements visit — orange ◆, one per package. 'group' = several packages render on this spot, but not literally every open package in the project (that's 'all')
  itemId: string;    // deep-link target (earliest item)
  wpId?: string;     // package to reschedule on drag ('all'/'group' → several, see wpEntries)
  orderNow: boolean; // package has an item past its buy-by (ORDER NOW) → red ring
  complete: boolean; // every item reached its scope's closing stage → green ring
  readiness: PkgReadiness; // the tier EVERY package on this dot has cleared (the min)
  supplyOnly: boolean;     // false for a mixed group — see the comment where it's built
  /** kind 'all' | 'group' — the packages this dot collapsed, for the tooltip and picker. */
  wpEntries?: MsPackage[];
  /** The collapsed packages do NOT share one date: they merely LAND on the same spot
   * because `frac` clamps every overdue date onto the TODAY line. When this is set the
   * tooltip has to print each package's own date, or the dot would claim a single Req.
   * date that three of its four packages never had. */
  spread?: boolean;
}
interface Lane {
  project: Project;
  milestones: Milestone[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LANE_LABEL_W = 156;
const TL_INSET = 10;
const HEADER_H = 24; // month strip ABOVE the lanes (a Gantt reads its scale at the top)
const LANE_H = 40;
const TL_RED = '#d84343'; // today / ORDER NOW — the one hue that isn't a brand token

/* The legend lives in the section header next to the title, not inside the card: the
   dots mean the same thing whether or not there are lanes, and up there they read as a
   key to the chart instead of as a first row of content. */
function TimelineLegend() {
  const item = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', font: 'var(--text-caption)', color: 'var(--muted)' }}>
      <span style={item} title="One work package's On-Site Req. date"><span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--brand-slate)', border: '2px solid var(--canvas)', boxShadow: '0 0 0 2px var(--brand-slate)' }} /> WP Req. date</span>
      <span style={item} title="Every open package in the project needs its material on the same date — the dot collapses them into one. Hover it for the list, click it to pick one. A partial group (some of the packages, not all) collapses the same way but keeps the normal dot size."><span style={{ width: 17, height: 17, borderRadius: '50%', background: 'var(--brand-teal)', border: '2px solid var(--canvas)', boxShadow: '0 0 0 2px var(--brand-slate)' }} /> All packages, one date</span>
      <span style={item} title="Field measurements visit — one per package. It stays here, pinned to today once the date passes, until you confirm the measurements were taken (click the ◆, or set Field measurements to Approved in Breakdown Submittals)."><span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: 'var(--brand-orange)', border: '2px solid var(--canvas)', boxShadow: '0 0 0 2px var(--brand-orange)' }} /> Field measure</span>
      <span style={item} title="The package's Req. date has passed, or it still has items past their buy-by date"><span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--brand-slate)', border: '2px solid var(--canvas)', boxShadow: `0 0 0 2px ${TL_RED}` }} /> Past due / ORDER NOW</span>
      <span style={item} title="Every item in the package is closed out"><span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--brand-slate)', border: '2px solid var(--canvas)', boxShadow: '0 0 0 2px var(--success-border)' }} /> Closed out</span>
      <span style={item} title="The stretch between a project's first and last milestone — how long its material keeps landing"><span style={{ width: 22, height: 7, borderRadius: 4, background: 'color-mix(in srgb, var(--brand-slate) 28%, transparent)' }} /> Delivery window</span>
    </div>
  );
}

/** The ✓ that says how far a package has actually got, for the timeline tooltip and its
 * package picker. Colour AND word, never colour alone — see `READINESS_META`. `word` is
 * dropped when the caller already prints the tier once for the whole dot. */
function ReadinessTick({ readiness, supplyOnly, tick = true, word = true }: {
  readiness: PkgReadiness; supplyOnly: boolean;
  /** The two halves are separately switchable because both callers lay them out in a grid
   * and need them in DIFFERENT columns — rendered as one unit they could never align. */
  tick?: boolean; word?: boolean;
}) {
  const mark = readinessMark(readiness, supplyOnly);
  const color = `var(${mark.token})`;
  return (
    <>
      {tick && <span aria-hidden style={{ color, fontWeight: 700 }}>{mark.glyph}</span>}
      {word && <span style={{ color }}>{mark.word}</span>}
    </>
  );
}

function ReqDateTimeline({ lanes, onJumpItem, onJumpProject, onSetDate, onConfirmFm }: {
  lanes: Lane[];
  onJumpItem: (projectId: string, itemId: string) => void;
  onJumpProject: (projectId: string) => void;
  onSetDate: (projectId: string, wpId: string | undefined, iso: string, field: 'onsite' | 'fieldDate', wpIds?: string[]) => void;
  /** Click on a ◆ — "we measured": marks the package's Field measurements Approved. */
  onConfirmFm: (wpId: string, wpLabel: string, date: string) => void;
}) {
  const [hover, setHover] = useState<{ laneIdx: number; msIdx: number } | null>(null);
  const [drag, setDrag] = useState<{ laneIdx: number; msIdx: number; date: string } | null>(null);
  const dragRef = useRef<{ laneIdx: number; msIdx: number; rect: DOMRect; startX: number; moved: boolean } | null>(null);
  // Which package did you mean? A collapsed "all" dot speaks for several packages, so its
  // click can no longer just jump to the project (the lane label already does that) — it
  // opens this picker instead. Not a portal: like the hover tooltip, it lives inside the
  // lane row, which nothing here clips (see the comment on the grid layer above).
  const [picker, setPicker] = useState<{ laneIdx: number; msIdx: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  // Fixed 6-month window anchored to today — the axis scrolls forward a day at a time.
  // `bands` are the month SLICES (not just their labels): each one paints its own column
  // behind the lanes, alternating, so a dot can be placed in its month without tracing it
  // down to the axis. That zebra is what replaced the heavy month rules — the point of a
  // chart this dense is to carry the rhythm with the least ink that still reads.
  const { fracT, bands, boundaries, weeks, tStart, span } = useMemo(() => {
    const start = parseISO(today());
    const t0 = start.getTime();
    const tEnd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 6, start.getUTCDate());
    const sp = Math.max(1, tEnd - t0);
    const f = (t: number) => Math.min(1, Math.max(0, (t - t0) / sp));
    // month 1sts inside the window → vertical rules + the cuts between bands
    const bs: number[] = [];
    let m = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    while (m <= tEnd) { const d = new Date(m); bs.push(m); m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
    // Week starts (Mondays) inside the window → dotted secondary rules. getUTCDay: 0=Sun,
    // 1=Mon…; step to the first Monday after today (today already has its own red line).
    const wks: number[] = [];
    const offToMon = ((1 - start.getUTCDay() + 7) % 7) || 7;
    let w = t0 + offToMon * 86400000;
    while (w < tEnd) { wks.push(w); w += 7 * 86400000; }
    const cuts = [t0, ...bs, tEnd];
    const bnds: { f0: number; f1: number; mid: number; label: string }[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i]; const b = cuts[i + 1];
      if (b <= a) continue;
      const d = new Date(a);
      bnds.push({
        f0: f(a), f1: f(b), mid: (f(a) + f(b)) / 2,
        label: d.getUTCMonth() === 0 ? `${MONTHS[0]} '${String(d.getUTCFullYear()).slice(2)}` : MONTHS[d.getUTCMonth()],
      });
    }
    return { fracT: f, bands: bnds, boundaries: bs, weeks: wks, tStart: t0, span: sp };
  }, []);

  const frac = (iso: string) => fracT(parseISO(iso).getTime());
  const leftOf = (f: number) => `calc(${TL_INSET}px + (100% - ${TL_INSET * 2}px) * ${f})`;
  // Pointer x within a lane track → snapped ISO date inside the window (>= today).
  const dateAtX = (clientX: number, rect: DOMRect) => {
    const innerW = Math.max(1, rect.width - TL_INSET * 2);
    let f = (clientX - (rect.left + TL_INSET)) / innerW;
    f = Math.min(1, Math.max(0, f));
    const spanDays = Math.max(1, Math.round(span / 86400000));
    const days = Math.round(f * spanDays);
    return new Date(tStart + days * 86400000).toISOString().slice(0, 10);
  };

  if (lanes.length === 0) {
    return (
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--canvas)', padding: '22px 16px', textAlign: 'center', font: 'var(--text-body)', color: 'var(--muted)' }}>
        No On-Site Req. or Field Measure dates yet. Confirm dates on a work package — each package lands as a milestone here.
      </div>
    );
  }

  const todayISO = today();
  // The red ring covers BOTH reasons a package is on fire: it's still got an ORDER NOW
  // item, or its Req. date has simply come and gone (lote 63) — the pin below is what
  // keeps a past-due dot from disappearing, and the ring has to say why it's stuck.
  const ringOf = (m: Milestone) => (m.kind === 'fm' ? 'var(--brand-orange)' : (m.orderNow || m.date < todayISO) ? TL_RED : m.complete ? 'var(--success-border)' : 'var(--brand-slate)');
  /** Right edge of a band/segment, as a `right:` offset — nested calc() is legal CSS and
   * saves carrying the track's pixel width into JS just to subtract two fractions. */
  const rightOf = (f: number) => `calc(100% - ${leftOf(f)})`;

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--canvas)', padding: '6px 16px 10px', position: 'relative', boxShadow: 'var(--shadow-card)' }}>
      {/* Month scale on TOP, where a Gantt is read. The TODAY pill is pinned to the very
          start of the window (today IS the left edge), and the first month label is
          clamped past it with max() so the two can never sit on each other when the
          current month has only a few days left in view. */}
      <div style={{ display: 'flex', height: HEADER_H, alignItems: 'flex-end' }}>
        <span style={{ width: LANE_LABEL_W, flexShrink: 0 }} />
        <div style={{ position: 'relative', flex: 1, height: '100%' }}>
          {bands.map((b, i) => (
            <span
              key={i}
              style={{
                position: 'absolute', bottom: 4, transform: 'translateX(-50%)',
                left: i === 0 ? `max(74px, ${leftOf(b.mid)})` : leftOf(b.mid),
                font: 'var(--text-mono-sm)', fontSize: 13, fontWeight: 700, letterSpacing: 0.4,
                color: 'var(--title)', whiteSpace: 'nowrap',
              }}
            >
              {b.label}
            </span>
          ))}
          <span
            title="The window starts today — everything to the right is still ahead of you."
            style={{
              position: 'absolute', left: 0, bottom: 3, background: TL_RED, color: '#fff',
              font: 'var(--text-mono-sm)', fontWeight: 700, letterSpacing: 0.5,
              padding: '1px 8px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
            }}
          >
            TODAY
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', borderTop: '1px solid var(--hairline)' }}>
        {/* Grid layer — alternating month columns, week hairlines, month cuts and today.
            `overflow: hidden` lets the first and last band run to the card's edge instead
            of stopping at the inset and leaving a 10px unpainted sliver. Tooltips live in
            the lane rows below, never in here, so nothing clippable is inside. */}
        <div style={{ position: 'absolute', left: LANE_LABEL_W, right: 0, top: 0, bottom: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
          {bands.map((b, i) => (i % 2 === 1 ? (
            <div
              key={`band${i}`}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: leftOf(b.f0), right: i === bands.length - 1 ? 0 : rightOf(b.f1),
                background: 'var(--surface-soft)',
              }}
            />
          ) : null))}
          {/* Mondays — kept, but pulled way back: the month zebra now carries the rhythm,
              so these only have to be there when you go looking for a week. */}
          {weeks.map((w) => (
            <div key={`w${w}`} style={{ position: 'absolute', left: leftOf(fracT(w)), top: 0, bottom: 0, width: 0, borderLeft: '1px dotted var(--hairline)', opacity: 0.45 }} />
          ))}
          {boundaries.map((b) => (
            <div key={b} style={{ position: 'absolute', left: leftOf(fracT(b)), top: 0, bottom: 0, width: 0, borderLeft: '1px solid var(--border-strong)', opacity: 0.5 }} />
          ))}
          <div style={{ position: 'absolute', left: leftOf(0), top: 0, bottom: 0, width: 0, borderLeft: `2px dashed ${TL_RED}` }} />
        </div>
        {/* Divider between the project column and the chart — makes the labels read as a
            fixed column instead of as text that happens to be to the left. */}
        <div style={{ position: 'absolute', left: LANE_LABEL_W - 10, top: 0, bottom: 0, width: 0, borderLeft: '1px solid var(--hairline)', pointerEvents: 'none', zIndex: 0 }} />

        {lanes.map((lane, laneIdx) => {
          // The project's delivery window: first milestone → last. One glance says how
          // long this project keeps landing material, which the loose dots never did.
          const fs = lane.milestones.map((m) => frac(m.date));
          const wFrom = Math.min(...fs);
          const wTo = Math.max(...fs);
          return (
            <div key={lane.project.id} className="tl-lane" style={{ display: 'flex', alignItems: 'center', height: LANE_H, position: 'relative', zIndex: 1 }}>
              <button
                type="button"
                className="tl-lane-label"
                onClick={() => onJumpProject(lane.project.id)}
                title={`Open ${lane.project.name}`}
                style={{ width: LANE_LABEL_W, flexShrink: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', font: 'var(--text-caption)', fontWeight: 600, color: 'var(--title)', padding: '0 16px 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {lane.project.name}
              </button>
              <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                <div style={{ position: 'absolute', left: TL_INSET, right: TL_INSET, top: '50%', height: 3, marginTop: -1.5, background: 'var(--hairline)', borderRadius: 2 }} />
                {fs.length > 1 && (
                  <div
                    style={{
                      position: 'absolute', left: leftOf(wFrom), right: rightOf(wTo), top: '50%', height: 8, marginTop: -4,
                      borderRadius: 4, background: 'color-mix(in srgb, var(--brand-slate) 28%, transparent)',
                    }}
                  />
                )}
                {/* Drag guide — a dashed rule under the cursor, so the dot lands on a date
                    you can see against the month band instead of by feel. */}
                {drag?.laneIdx === laneIdx && (
                  <div style={{ position: 'absolute', left: leftOf(frac(drag.date)), top: 2, bottom: 2, width: 0, borderLeft: '2px dashed var(--brand-slate)', pointerEvents: 'none', zIndex: 3 }} />
                )}
                {lane.milestones.map((m, msIdx) => {
                  const big = m.kind === 'all';
                  // 'all' and 'group' both speak for more than one package, so a click opens
                  // the picker instead of jumping to one arbitrarily-chosen item. Only 'all'
                  // gets the bigger teal dot — that visual is the legend's documented "All
                  // material" mark, and a partial group isn't that.
                  const pickable = m.kind === 'all' || m.kind === 'group';
                  const fm = m.kind === 'fm';
                  // A ◆ whose day came and went with nobody confirming it. It sits on the
                  // TODAY line (the clamp in `frac`) and pulses in its own orange, because
                  // pinned-and-silent is exactly how a site visit gets forgotten.
                  const fmOverdue = fm && m.date < todayISO;
                  const d = big ? 20 : fm ? 14 : 13;
                  const isHover = hover?.laneIdx === laneIdx && hover?.msIdx === msIdx;
                  const isDragging = drag?.laneIdx === laneIdx && drag?.msIdx === msIdx;
                  const lifted = isHover || isDragging;
                  const posFrac = isDragging ? frac(drag.date) : frac(m.date);
                  const ring = ringOf(m);
                  // The native title and the aria-label carry the same two facts the visual
                  // tooltip does — which packages, and how far they have got — because a
                  // screen reader never sees the hover panel at all.
                  const pkgList = m.wpEntries ? ` (${m.wpEntries.map((e) => e.label).join(', ')})` : '';
                  const readyWord = fm ? null : readinessMark(m.readiness, m.supplyOnly);
                  const readyNote = readyWord ? ` · ${m.wpEntries ? 'all packages ' : ''}${readyWord.word}` : '';
                  return (
                    <button
                      key={msIdx}
                      type="button"
                      // The ORDER NOW ring breathes (tl-dot--alert): in a portfolio of
                      // eight lanes the static ring alone loses the race for attention.
                      className={`tl-dot${(m.orderNow || m.date < todayISO) ? ' tl-dot--alert' : ''}${fmOverdue ? ' tl-dot--fm-alert' : ''}`}
                      title={`${m.label}${pkgList} — ${fm ? 'Field measure' : 'Req.'} ${fmtMDY(m.date)}${fmOverdue ? ' (passed — not confirmed)' : ''}${readyNote} · drag to reschedule${fm ? ' · click to confirm measured' : pickable ? ' · click to pick a package' : ''}`}
                      aria-label={`${lane.project.name} — ${m.label}${pkgList} — ${fm ? 'Field measure' : 'Req.'} ${fmtMDY(m.date)}${fmOverdue ? ' — passed, not confirmed' : ''}${readyNote}`}
                      onMouseEnter={() => setHover({ laneIdx, msIdx })}
                      onMouseLeave={() => setHover(null)}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        dragRef.current = { laneIdx, msIdx, rect: track, startX: e.clientX, moved: false };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const di = dragRef.current;
                        if (!di || di.laneIdx !== laneIdx || di.msIdx !== msIdx) return;
                        if (Math.abs(e.clientX - di.startX) > 3) di.moved = true;
                        if (di.moved) setDrag({ laneIdx, msIdx, date: dateAtX(e.clientX, di.rect) });
                      }}
                      onPointerUp={(e) => {
                        const di = dragRef.current;
                        dragRef.current = null;
                        setDrag(null);
                        if (!di) return;
                        if (di.moved) {
                          const iso = dateAtX(e.clientX, di.rect);
                          // Name the packages instead of saying "all packages in <project>",
                          // which was never quite true and is now plainly wrong: a package
                          // that is already closed out drops off the lane, so an 'all' dot
                          // means every OPEN package, not every package. Listing them is also
                          // what makes a spread group's confirm honest — it is about to
                          // collapse several different dates onto one.
                          const scope = m.wpEntries?.map((x) => x.label).join(', ') ?? m.label;
                          const msg = `Move the ${m.kind === 'fm' ? 'Field Measurements' : 'On-Site Req.'} date for ${scope} to ${fmtMDY(iso)}?`
                            + (m.spread ? `\n\nThese are on ${m.wpEntries!.length} different dates today — this puts them all on ${fmtMDY(iso)}.` : '')
                            + `\n\nThis publishes ${pickable ? 'those packages' : 'that package'} to the report — any other pending edits in it go too. Undo is available right after.`;
                          if (window.confirm(msg)) {
                            // Always the dot's OWN packages, never "the whole project": the
                            // dot speaks for the open ones and those are the only ones the
                            // user can see it standing for.
                            onSetDate(lane.project.id, m.wpId, iso, m.kind === 'fm' ? 'fieldDate' : 'onsite', m.wpEntries?.map((x) => x.wpId));
                          }
                        // The collapsed/grouped dot speaks for several packages — jumping
                        // straight to the project (or to one of them, arbitrarily) isn't
                        // useful, so the click opens a picker instead.
                        } else if (pickable) setPicker((p) => (p?.laneIdx === laneIdx && p?.msIdx === msIdx ? null : { laneIdx, msIdx }));
                        // A ◆ that only leaves when the visit is confirmed has to offer the
                        // confirmation where it sits, so on this one dot the click means
                        // "we measured" instead of "open the item" — the item is still one
                        // click away through the lane label. Drag still reschedules.
                        else if (fm && m.wpId) onConfirmFm(m.wpId, m.label, m.date);
                        else onJumpItem(lane.project.id, m.itemId);
                      }}
                      style={{
                        position: 'absolute', left: leftOf(posFrac), top: '50%',
                        // The scale rides in the inline transform because the ◆ carries a
                        // rotate here too, and an inline transform always beats a :hover
                        // rule — the hover state the component already tracks does it.
                        transform: `translate(-50%, -50%)${fm ? ' rotate(45deg)' : ''} scale(${lifted ? 1.3 : 1})`,
                        width: d, height: d, borderRadius: fm ? 3 : '50%',
                        background: big ? 'var(--brand-teal)' : fm ? 'var(--brand-orange)' : 'var(--brand-slate)',
                        border: '2px solid var(--canvas)',
                        boxShadow: `0 0 0 2px ${ring}${lifted ? `, 0 0 0 7px color-mix(in srgb, ${ring} 22%, transparent), var(--shadow-pop)` : ''}`,
                        cursor: 'ew-resize', padding: 0, touchAction: 'none',
                        transition: 'transform 110ms ease, box-shadow 110ms ease',
                        zIndex: isDragging ? 6 : isHover ? 5 : 2,
                      }}
                    />
                  );
                })}
                {hover?.laneIdx === laneIdx && !drag
                  && !(picker?.laneIdx === laneIdx && picker?.msIdx === hover.msIdx) && (() => {
                  const m = lane.milestones[hover.msIdx];
                  const f = frac(m.date);
                  // Anchor flip: centred in the middle of the window, but pinned near its
                  // own edge at the extremes so a tooltip at Jan or at the far month
                  // doesn't hang outside the card. The caret follows the same anchor.
                  const anchor = f > 0.78 ? 88 : f < 0.22 ? 12 : 50;
                  // `wpEntries` arrives date-ascending (it is built off the date-sorted
                  // `visible`), so first and last bound the range a spread group covers.
                  const entries = m.wpEntries ?? [];
                  const mult = entries.length > 1;
                  // A hover tooltip that outgrows the card it hangs off is worse than one
                  // that admits it is showing six of nine — and the picker behind the click
                  // has all of them, which is what the "+N more" line points at.
                  const shown = entries.slice(0, 6);
                  const hiddenCount = entries.length - shown.length;
                  // All on the same tier → one collective ✓. Different tiers → per package.
                  const tiersDiffer = mult && entries.some((e) => e.readiness !== entries[0].readiness);
                  const datePart = m.spread
                    ? `${fmtMDY(entries[0].date)} → ${fmtMDY(entries[entries.length - 1].date)}`
                    : fmtMDY(m.date);
                  const dateHeadline = `${m.kind === 'fm' ? 'Measure' : 'Req.'} ${datePart}`;
                  return (
                    <div data-timeline-tooltip style={{
                      position: 'absolute', left: leftOf(f), bottom: 'calc(50% + 16px)', transform: `translateX(-${anchor}%)`,
                      zIndex: 10, background: 'var(--brand-dark)', color: '#fff', borderRadius: 'var(--radius-sm)',
                      // A collapsed dot needs the extra room, and 364 is measured, not
                      // guessed: at 280 the four columns squeeze the longest package name
                      // down to a stub. Longer names ellipsize with the full text in the
                      // cell's title, and the picker behind the click has more room again.
                      padding: '8px 11px', font: 'var(--text-caption)', maxWidth: mult ? 364 : 280, boxShadow: 'var(--shadow-pop)', pointerEvents: 'none',
                    }}>
                      <div style={{ fontWeight: 700 }}>{lane.project.name}</div>
                      {/* HEADLINE: the collective label as a highlighted chip, with the Req.
                          date on the SAME line — what matters first is seeing WHEN the
                          material is required on site, so the date sits at the top instead
                          of under a list. Both scopes say the neutral "Req." now; what the
                          material has actually DONE is the ✓ below, which is derived and
                          cannot contradict itself. */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', margin: '2px 0 1px' }}>
                        {m.kind === 'fm' ? (
                          <span style={{ color: 'var(--brand-orange)' }}>◆ Field measurements — {m.label}</span>
                        ) : mult ? (
                          <span style={{
                            background: 'var(--brand-teal)', color: 'var(--brand-dark)', fontWeight: 700,
                            padding: '1px 7px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
                          }}>
                            {m.label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--brand-teal)' }}>{m.label}</span>
                        )}
                        <span style={{ color: 'rgba(255,255,255,0.85)', font: 'var(--text-mono-sm)', whiteSpace: 'nowrap' }}>
                          {dateHeadline}
                        </span>
                      </div>
                      {/* The collective ✓ — printed ONLY when every package on the dot sits on
                          the same tier, because then the per-package words below would be the
                          same word repeated. When they differ this line is dropped and each
                          package carries its own. */}
                      {m.kind !== 'fm' && !tiersDiffer && (
                        <div style={{ display: 'flex', gap: 5, font: 'var(--text-mono-sm)' }}>
                          <ReadinessTick readiness={m.readiness} supplyOnly={m.supplyOnly} />
                          {mult && <span style={{ color: 'rgba(255,255,255,0.5)' }}>— all {entries.length} packages</span>}
                        </div>
                      )}
                      {/* One row per package. A grid so the ✓, the names, the tier words and
                          the dates each line up in their own column instead of ragging. The
                          name column is minmax(0,1fr) + ellipsis so a long label can't push
                          the date out of the tooltip. */}
                      {shown.length > 0 && (
                        <div style={{
                          display: 'grid', gridTemplateColumns: `${tiersDiffer ? 'auto ' : ''}minmax(0, 1fr)${tiersDiffer ? ' auto' : ''}${m.spread ? ' auto' : ''}`,
                          columnGap: 6, rowGap: 1, margin: '2px 0 1px', font: 'var(--text-mono-sm)',
                        }}>
                          {shown.map((e) => (
                            <Fragment key={e.wpId}>
                              {/* No bullet column when the tiers agree — the collective mark
                                  above already spoke, and a decorative · here would sit on
                                  the same panel as the red · that MEANS "not ordered". */}
                              {tiersDiffer && <ReadinessTick readiness={e.readiness} supplyOnly={e.supplyOnly} word={false} />}
                              <span title={e.label} style={{ color: 'rgba(255,255,255,0.85)', paddingLeft: tiersDiffer ? 0 : 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                              {tiersDiffer && (
                                <span style={{ whiteSpace: 'nowrap' }}>
                                  <ReadinessTick readiness={e.readiness} supplyOnly={e.supplyOnly} tick={false} />
                                </span>
                              )}
                              {/* Each package's OWN date, only when the dot collapsed several
                                  different ones (all overdue, all clamped onto TODAY). With one
                                  shared date this column would repeat the headline N times. */}
                              {m.spread && <span style={{ color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{fmtMD(e.date)}</span>}
                            </Fragment>
                          ))}
                        </div>
                      )}
                      {/* Bounded, and it SAYS it is bounded — a silent truncation would read
                          as "these are all of them". */}
                      {hiddenCount > 0 && (
                        <div style={{ color: 'rgba(255,255,255,0.55)', font: 'var(--text-mono-sm)' }}>+{hiddenCount} more — click to see all</div>
                      )}
                      {m.date < todayISO && (
                        <div style={{ color: 'var(--alert-on-dark)', font: 'var(--text-mono-sm)' }}>
                          {m.kind === 'fm' ? '⏰ Visit date passed — pinned until confirmed' : '⏰ Req. date passed — pinned to today'}
                        </div>
                      )}
                      {m.orderNow && <div style={{ color: 'var(--alert-on-dark)', font: 'var(--text-mono-sm)' }}>⚠ has ORDER NOW items</div>}
                      <div style={{ color: 'rgba(255,255,255,0.55)', font: 'var(--text-mono-sm)', marginTop: 3 }}>
                        ↔ drag to reschedule · {m.kind === 'fm' ? 'click: measurements taken ✓' : (m.kind === 'all' || m.kind === 'group') ? 'click to pick a package' : 'click to open'}
                      </div>
                      <span style={{
                        position: 'absolute', top: '100%', left: `${anchor}%`, transform: 'translateX(-50%)',
                        width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                        borderTop: '6px solid var(--brand-dark)',
                      }} />
                    </div>
                  );
                })()}
                {picker?.laneIdx === laneIdx && (() => {
                  const m = lane.milestones[picker.msIdx];
                  if ((m.kind !== 'all' && m.kind !== 'group') || !m.wpEntries) return null;
                  const f = frac(m.date);
                  const anchor = f > 0.78 ? 88 : f < 0.22 ? 12 : 50;
                  return (
                    <div ref={pickerRef} style={{
                      position: 'absolute', left: leftOf(f), bottom: 'calc(50% + 16px)', transform: `translateX(-${anchor}%)`,
                      zIndex: 12, background: 'var(--brand-dark)', color: '#fff', borderRadius: 'var(--radius-sm)',
                      padding: '8px 11px', font: 'var(--text-caption)', maxWidth: 372, minWidth: 240, boxShadow: 'var(--shadow-pop)',
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{lane.project.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', font: 'var(--text-mono-sm)', marginBottom: 4 }}>Which package?</div>
                      {/* Unlike the tooltip this list is never capped — it is what the
                          tooltip's "+N more" sends you to, so it has to hold all of them. */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 'calc(46vh / var(--ui-scale))', overflowY: 'auto' }}>
                        {m.wpEntries.map((e) => (
                          <button
                            key={e.wpId}
                            type="button"
                            onClick={() => { setPicker(null); onJumpItem(lane.project.id, e.itemId); }}
                            title={`Open ${e.label} — Req. ${fmtMDY(e.date)}`}
                            style={{
                              display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'baseline', columnGap: 6,
                              textAlign: 'left', background: 'transparent', border: 'none', color: '#fff',
                              padding: '4px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', font: 'var(--text-caption)',
                            }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                          >
                            <ReadinessTick readiness={e.readiness} supplyOnly={e.supplyOnly} word={false} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                            <span style={{ font: 'var(--text-mono-sm)', whiteSpace: 'nowrap' }}>
                              <ReadinessTick readiness={e.readiness} supplyOnly={e.supplyOnly} tick={false} />
                            </span>
                          </button>
                        ))}
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 6, paddingTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => { setPicker(null); onJumpProject(lane.project.id); }}
                          style={{
                            textAlign: 'left', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)',
                            padding: '2px 6px', cursor: 'pointer', font: 'var(--text-mono-sm)', width: '100%',
                          }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                        >
                          Open project →
                        </button>
                      </div>
                      <span style={{
                        position: 'absolute', top: '100%', left: `${anchor}%`, transform: 'translateX(-50%)',
                        width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                        borderTop: '6px solid var(--brand-dark)',
                      }} />
                    </div>
                  );
                })()}
                {drag?.laneIdx === laneIdx && (
                  <div data-timeline-drag style={{
                    position: 'absolute', left: leftOf(frac(drag.date)), bottom: 'calc(50% + 16px)', transform: 'translateX(-50%)',
                    zIndex: 11, background: 'var(--brand-slate)', color: '#fff', borderRadius: 'var(--radius-pill)',
                    padding: '4px 11px', font: 'var(--text-mono-sm)', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-pop)', pointerEvents: 'none',
                  }}>
                    {fmtMDY(drag.date)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- overview */

export function OverviewScreen() {
  const { db, nav, actions, setActiveProjectId, thresholdsFor, jumpToItem } = useApp();
  const [groupMode, setGroupMode] = useState<'wp' | 'project'>('wp');
  // Installation status: the mosaic of project cards, or the package table it grew out
  // of. Two views of one dataset, so it's a view switch and not a filter — the mosaic
  // answers "which project is behind", the table "what exactly is where".
  const [installView, setInstallView] = useState<'mosaic' | 'table'>('mosaic');
  // Detailed table: pending-only by default (the actionable list); toggle to see every
  // package that has material in hand, including the ones already closed out.
  const [stagePending, setStagePending] = useState(true);
  // Collapsed project groups in the Detailed table (default: expanded).
  const [stageCollapsed, setStageCollapsed] = useState<Record<string, boolean>>({});
  const toggleStage = (id: string) => setStageCollapsed((c) => ({ ...c, [id]: !c[id] }));
  // Which project + badge has its item list open, if any. Holds the coordinates and not
  // the card, for the same reason `drillKey` does: the cards are rebuilt every render.
  const [badgeDrill, setBadgeDrill] = useState<{ projectId: string; key: MosaicBadgeKey } | null>(null);
  // The package whose per-item aging list is open, if any. Holds the KEY and not the
  // group: the groups are rebuilt on every render, so a captured object would go stale
  // the moment anything in the portfolio changes underneath the modal.
  const [drillKey, setDrillKey] = useState<string | null>(null);
  // The three gauge-triggered modals (lote 63) — each holds a boolean, not a row list:
  // the rows are rebuilt every render off live data, so a stale captured array would
  // drift from the board underneath the modal the moment a write lands.
  const [showLate, setShowLate] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [showAwaiting, setShowAwaiting] = useState(false);
  // The package whose close-out window is open, if any — a mosaic bar click. Coordinates,
  // not the row, for the same reason as `drillKey`: rows are rebuilt every render, so the
  // modal follows live data and updates itself right after a write.
  const [pkgModal, setPkgModal] = useState<{ projectId: string; wpId: string } | null>(null);
  // The quick-edit window, likewise by coordinates — which items and what title, never
  // the values themselves.
  const [quickEdit, setQuickEdit] = useState<{ title: string; caption: string; ids: string[]; variant: QuickEditVariant } | null>(null);
  // The date a board write is waiting on. One state for every button that moves material:
  // each builds its own `DatePrompt` (text + `onConfirm`) and the modal only asks the day.
  const [datePrompt, setDatePrompt] = useState<DatePrompt | null>(null);

  const activeProjects = db.projects
    .filter((p) => !p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const activeIds = new Set(activeProjects.map((p) => p.id));
  // Portfolio grouping is a PROJECT decision, but a project created before the flag
  // existed can only say "supply only" by having all its packages marked — so that
  // counts too (projectClosesAtSite).
  const pkgsOf = (projectId: string) => db.packages.filter((p) => p.projectId === projectId);
  const supplyOnlyProject = (p: Project) => projectClosesAtSite(p, pkgsOf(p.id));
  // The whole supply-only layer stays invisible until something is actually marked as
  // such — no empty table, no section headers for a portfolio that always installs.
  const hasSupplyOnly = activeProjects.some(supplyOnlyProject) || db.packages.some((p) => p.supplyOnly && activeIds.has(p.projectId));
  const enriched: Enriched[] = db.items
    .filter((i): i is MaterialItem & { report: ReportSnapshot } => !!i.report)
    .map((i) => {
      const pkg = db.packages.find((p) => p.id === i.wpId)!;
      const t = thresholdsFor(pkg.projectId);
      const supplyOnly = closesAtSite(pkg, db.projects.find((p) => p.id === pkg.projectId));
      return { i, pkg, projectId: pkg.projectId, c: computeItem(i.report, { window: t.window, supplyOnly }), r: i.report, supplyOnly };
    })
    .filter((x) => activeIds.has(x.projectId));

  const portfolio = activeProjects.map((p) => {
    const rows = enriched.filter((x) => x.projectId === p.id);
    // `closed` / `awaiting` are measured against each PACKAGE's own closing stage, so a
    // mixed project still reads on one bar: its supply-only packages close on site and
    // its supply-and-install packages close when installed.
    const t2 = { project: p, items: rows.length, orderNow: 0, soon: 0, needs: 0, planned: 0, ordered: 0, partial: 0, closed: 0, awaiting: 0, na: 0 };
    rows.forEach((x) => {
      const s = x.c.status;
      if (s === 'order-now') t2.orderNow++;
      else if (s === 'order-soon') t2.soon++;
      else if (s === 'needs-data') t2.needs++;
      else if (s === 'planned') t2.planned++;
      else if (s === 'ordered') t2.ordered++;
      else if (s === 'partial') t2.partial++;
      else if (s === 'na') t2.na++;
      if (isClosed(x.r, x.supplyOnly)) t2.closed++;
      else if (awaitingInstall(x.r, x.supplyOnly)) t2.awaiting++;
    });
    return t2;
  });
  const totalOrderNow = portfolio.reduce((s, p) => s + p.orderNow, 0);
  const portfolioSections = hasSupplyOnly
    ? [
        { title: '📍 SUPPLY ONLY', rows: portfolio.filter((p) => supplyOnlyProject(p.project)) },
        { title: '🔩 SUPPLY AND INSTALL', rows: portfolio.filter((p) => !supplyOnlyProject(p.project)) },
      ].filter((s) => s.rows.length > 0)
    : [{ title: 'all', rows: portfolio }];

  // ---- Overview indicators (all off published report snapshots) ----
  const statusTotals = { 'order-now': 0, 'order-soon': 0, 'needs-data': 0, planned: 0, ordered: 0, partial: 0, delivered: 0, 'on-site': 0, installed: 0, na: 0 } as Record<ItemStatus, number>;
  enriched.forEach((x) => { statusTotals[x.c.status]++; });
  const orderable = (s: ItemStatus) => s === 'needs-data' || s === 'planned' || s === 'order-soon' || s === 'order-now';
  // Blocked by submittal — items still needing a PO with an unapproved component, broken
  // down by which component blocks them (product data / samples / shop / field / other).
  const blockedByCat: Record<string, number> = { 'Product data': 0, Samples: 0, 'Shop drawings': 0, 'Field measurements': 0, Other: 0 };
  let blockedTotal = 0;
  enriched.forEach((x) => {
    if (!orderable(x.c.status)) return;
    const bl = submittalBlockers(x.r);
    if (bl.length) blockedTotal++;
    bl.forEach((b) => { const k = b.startsWith('Other') ? 'Other' : b; if (k in blockedByCat) blockedByCat[k]++; });
  });
  const blockedNow = enriched.filter((x) => x.c.status === 'order-now' && !x.c.approved).length;
  // 🟠 gets the same second slot as 🔴 (lote 63): "make the PO" and "call the architect"
  // are different questions with different unblock actions, so a soon-to-be-ordered item
  // stuck on a submittal deserves its own count, not just ⛔'s combined total.
  const blockedSoon = enriched.filter((x) => x.c.status === 'order-soon' && submittalBlockers(x.r).length > 0).length;
  // Data completeness — what's missing that stalls the buy-by calc. Scoped to the items
  // actually IN needs-data, because this pair is the breakdown of that tile's number and
  // has to add up against it. Counting every item instead over-reports: an OFCI row has
  // no lead time by design (it never enters our procurement flow) and an item that has
  // already been ordered no longer needs one — neither is missing data, and both used to
  // land in this line and make the tile look inconsistent with its own subtitle.
  const incomplete = enriched.filter((x) => x.c.status === 'needs-data');
  const missingLead = incomplete.filter((x) => x.r.lead === '' || x.r.lead == null || isNaN(Number(x.r.lead))).length;
  const missingOnsite = incomplete.filter((x) => !x.r.onsite).length;
  const needsData = statusTotals['needs-data'];

  // ---- Awaiting close-out: the blind spot between "received" and "closed" ----
  // Material that is paid for and in hand but hasn't reached its last stage. Split by
  // where it physically is (warehouse vs jobsite) and by how urgent the move is. A
  // supply-only item drops out as soon as it's on site — that IS its wall.
  const awaiting = enriched.filter((x) => awaitingInstall(x.r, x.supplyOnly));
  const awaitingUrgency = (x: Enriched) => installUrgency(x.r, { window: thresholdsFor(x.projectId).window });
  const inWarehouse = awaiting.filter((x) => itemStage(x.r) === 'warehouse').length;
  const onSite = awaiting.filter((x) => itemStage(x.r) === 'on-site').length;
  const installOverdue = awaiting.filter((x) => awaitingUrgency(x) === 'overdue').length;
  const installUnscheduled = awaiting.filter((x) => awaitingUrgency(x) === 'unscheduled').length;

  // Timeline lanes — one per project; a milestone per work package (its earliest
  // On-Site date). If every package shares the same date, collapse to one big
  // "All Material Required" milestone that opens the project.
  //
  // Unlike the tables above, the timeline reads the LIVE working draft (not the
  // published report) so the global date button, the per-package header, and dragging
  // a milestone all reschedule the dot in place, before any Save to report.
  const timelineItems = db.items
    .map((i) => {
      const pkg = db.packages.find((p) => p.id === i.wpId);
      if (!pkg || !activeIds.has(pkg.projectId)) return null;
      const t = thresholdsFor(pkg.projectId);
      const supplyOnly = closesAtSite(pkg, db.projects.find((p) => p.id === pkg.projectId));
      return { i, pkg, c: computeItem(i, { window: t.window, supplyOnly }), supplyOnly };
    })
    .filter((x): x is { i: MaterialItem; pkg: WorkPackage; c: ComputedItem; supplyOnly: boolean } => x !== null);

  const lanes: Lane[] = activeProjects.map((project) => {
    const withDate = timelineItems.filter((x) => x.pkg.projectId === project.id && x.i.onsite);
    const byWp = new Map<string, typeof withDate>();
    withDate.forEach((x) => {
      const g = byWp.get(x.pkg.id);
      if (g) g.push(x); else byWp.set(x.pkg.id, [x]);
    });
    const wpMilestones: Milestone[] = [...byWp.values()].map((xs) => {
      const earliest = [...xs].sort((a, b) => a.i.onsite.localeCompare(b.i.onsite))[0];
      return {
        date: earliest.i.onsite, label: earliest.pkg.label, kind: 'wp' as const, itemId: earliest.i.id, wpId: earliest.pkg.id,
        orderNow: xs.some((x) => x.c.status === 'order-now'),
        // Green ring = every item reached its scope's closing stage (installed, or merely
        // on site when the package is supply only).
        complete: xs.every((x) => isClosed(x.i, x.supplyOnly)),
        // Measured over `xs` — the DATED items — and not over the package's full roster,
        // deliberately: `complete` and `orderNow` right above already scope themselves that
        // way, and a dot whose ✓ disagreed with its own ring would be worse than a dot that
        // ignores an undated item (which this whole lane already does).
        readiness: packageReadiness(xs.map((x) => x.i), earliest.supplyOnly),
        supplyOnly: earliest.supplyOnly,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    // The anchor is `!m.complete`, not a date comparison (lote 63 — same fix batch 57 made
    // to the field-measure diamond). The condition used to be `date >= today ||
    // hasOrderNow`: that second half is a question the BUY clock answers, so a package
    // already purchased and not yet installed answered no and the milestone vanished the
    // day after the material was needed on site. What releases an anchor is the work
    // being done (the package closing 100%), never time passing.
    const visible = wpMilestones.filter((m) => !m.complete);
    // Field Measurements — one orange ◆ per package with an OPEN visit (earliest wins if
    // items disagree; the toolbar popover nudges toward one date per package). Kept out of
    // the "All Material Required" collapse on purpose.
    //
    // A past visit does NOT drop off — it stays, pinned to today by the clamp in `frac`,
    // until someone confirms the measurements were taken (Field measurements → Approved,
    // from the ◆ itself or from the modal). Dropping it on the date was the bug: the one
    // milestone that needs a human to physically go somewhere was also the one that
    // disappeared by itself, so a visit nobody made left no trace anywhere.
    const fmByWp = new Map<string, typeof timelineItems>();
    timelineItems.filter((x) => x.pkg.projectId === project.id && fieldMeasurePending(x.i)).forEach((x) => {
      const g = fmByWp.get(x.pkg.id);
      if (g) g.push(x); else fmByWp.set(x.pkg.id, [x]);
    });
    const fmMilestones: Milestone[] = [...fmByWp.values()].map((xs) => {
      const earliest = [...xs].sort((a, b) => a.i.fieldDate.localeCompare(b.i.fieldDate))[0];
      return {
        date: earliest.i.fieldDate, label: earliest.pkg.label, kind: 'fm' as const, itemId: earliest.i.id, wpId: earliest.pkg.id,
        orderNow: false, complete: false, readiness: 'none' as const, supplyOnly: earliest.supplyOnly,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (visible.length === 0 && fmMilestones.length === 0) return { project, milestones: [] };
    // Collapse by RENDERED POSITION, not by raw date. Two packages that share a Req. date
    // land on the same pixel — but so do two OVERDUE packages with DIFFERENT dates, because
    // `frac` clamps everything before today onto the TODAY line. Both cases used to render
    // as separate buttons stacked on the identical spot, where hover and click only ever
    // reached whichever one the DOM painted last. Keying on the CLAMPED date fixes both.
    const todayForLanes = today();
    const posKey = (m: Milestone) => (m.date < todayForLanes ? todayForLanes : m.date);
    const byPos = new Map<string, Milestone[]>();
    visible.forEach((m) => {
      const g = byPos.get(posKey(m));
      if (g) g.push(m); else byPos.set(posKey(m), [m]);
    });
    const milestones: Milestone[] = [...byPos.values()].map((group) => {
      if (group.length === 1) return group[0];
      // 'all' keeps the collective wording only when the dot really is every open package
      // in the project; a partial group says how much of the project it is instead.
      const isAll = group.length === visible.length;
      // One scope for the whole dot, and a mixed group reads as supply-and-install: 📍 is
      // only a finish line when NOTHING on the dot still needs installing, so the
      // conservative side is the one that doesn't call a half-done group "delivered".
      const supplyOnly = group.every((m) => m.supplyOnly);
      // `visible` is date-sorted, so group[0] is the earliest — which is the date the dot
      // renders at (they all clamp to the same place when they're overdue).
      return {
        date: group[0].date,
        // "Req." in both scopes, deliberately: the Req. date means the same thing whether
        // or not we install it, so a supply-only project no longer announces "✅ All
        // Delivered" over material nobody has even ordered. The date is the headline; what
        // the material has actually DONE is the readiness ✓, which cannot contradict itself.
        label: isAll ? 'All Req.' : `${group.length} of ${visible.length} Req.`,
        kind: isAll ? ('all' as const) : ('group' as const),
        itemId: group[0].itemId, wpId: undefined,
        orderNow: group.some((m) => m.orderNow),
        complete: group.every((m) => m.complete),
        // The tier EVERY package on the dot has cleared. Same min-not-count rule as
        // `packageReadiness` itself, one level up.
        readiness: group.reduce<PkgReadiness>((lo, m) => (readinessRank(m.readiness) < readinessRank(lo) ? m.readiness : lo), 'installed'),
        supplyOnly,
        spread: group.some((m) => m.date !== group[0].date),
        wpEntries: group.map((m) => ({ wpId: m.wpId!, label: m.label, itemId: m.itemId, date: m.date, readiness: m.readiness, supplyOnly: m.supplyOnly })),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    return { project, milestones: [...milestones, ...fmMilestones] };
  }).filter((l) => l.milestones.length > 0);

  // Drag / button reschedule — set the same On-Site (or Field Measure) date on a
  // package's items (or the packages a collapsed dot actually stands for). Edits the
  // draft live.
  const setMilestoneDate = (projectId: string, wpId: string | undefined, iso: string, field: 'onsite' | 'fieldDate', wpIds?: string[]) => {
    const ids = wpId
      ? db.items.filter((i) => i.wpId === wpId).map((i) => i.id)
      : wpIds
        ? db.items.filter((i) => wpIds.includes(i.wpId)).map((i) => i.id)
        : db.packages.filter((p) => p.projectId === projectId).flatMap((p) => db.items.filter((i) => i.wpId === p.id).map((i) => i.id));
    if (!ids.length) return;
    actions.bulkEditItems(ids, field === 'fieldDate' ? { fieldDate: iso } : { onsite: iso });
    // Confirming the drag IS the save: Overview reads report snapshots, so leaving the
    // change in the draft would show the dot in its new place while every table around
    // it still reported the old date until someone went to the Material List and hit
    // Save. Both calls are functional setDb updates, so the publish sees the new date;
    // the undo snapshot is taken before either, so one Undo reverts the whole thing.
    if (wpId) actions.savePackageToReport(wpId);
    // A collapsed dot carries the exact packages it stands for, and only those get moved:
    // saveAllToReport would drag along an unrelated package on a group's drag, and — the
    // subtler one — a package that is already closed out and has therefore dropped off the
    // lane entirely, which the user cannot even see to expect it.
    else if (wpIds) actions.savePackagesToReport(wpIds);
    // Kept as the fallback for a caller that genuinely means the whole project. The
    // timeline no longer takes it: every multi-package dot passes `wpIds`.
    else actions.saveAllToReport(projectId);
  };

  // Confirm a field-measure visit from the ◆ itself — the other half of the anchor: if the
  // dot refuses to leave until someone says the measurements were taken, saying so has to
  // be reachable from where the dot is. Writes the same thing the Breakdown Submittals
  // modal writes (fieldStatus: 'approved'), scoped to the items of that package that
  // actually have the visit open, and publishes in the same gesture like every other
  // Overview write. `fieldReq` is left alone on purpose: requiring the component is about
  // blocking the ORDER and is the PM's call in the modal, not something a "yes, we
  // measured" click gets to decide.
  const confirmFieldMeasure = (wpId: string, wpLabel: string, date: string) => {
    const ids = db.items.filter((i) => i.wpId === wpId && fieldMeasurePending(i)).map((i) => i.id);
    if (!ids.length) return;
    const ok = window.confirm(
      `Field measurements for "${wpLabel}" taken?  (scheduled ${fmtMDY(date)})`
      + `\n\nMarks Field measurements as Approved on ${ids.length} item${ids.length === 1 ? '' : 's'} and drops the ◆ from the timeline.`
      + ` Not measured yet? Cancel and drag the ◆ to the new date instead.`
      + `\n\nThis publishes ${wpLabel} to the report — any other pending edits in it go too. Undo is available right after.`,
    );
    if (!ok) return;
    actions.bulkEditItems(ids, { fieldStatus: 'approved' });
    actions.savePackageToReport(wpId);
  };

  // ---- ⏰ Late deliveries: promised by the vendor, past that date, still not here ----
  // The third clock (SPEC-delivery-watch). 'unknown' — bought with no promised date — is
  // deliberately NOT counted here (§5.3): there can be many of them and they would drown
  // the handful that are genuinely late. They keep reading as "Confirm Date" in the list.
  const lateRows: LateRow[] = enriched
    .filter((x) => deliveryWatch(x.r, { window: thresholdsFor(x.projectId).window }) === 'late')
    .map((x) => ({
      key: x.i.id, projectId: x.projectId, projectName: db.projects.find((p) => p.id === x.projectId)?.name ?? '',
      wpId: x.pkg.id, wpLabel: x.pkg.label, itemId: x.i.id, description: x.r.description, vendor: x.r.vendor, po: x.r.po,
      promised: x.r.shipDate, behind: daysLate(x.r) ?? 0,
      // The verdict is resolved against the live DRAFT (`x.i`), not the snapshot — the
      // question is whether the write would land, and that's `stagePatch`'s call reading
      // the delivery log, which isn't a report field. Same `stageMoves` the mosaic's
      // package window uses — a half-delivered item, for instance, refuses the receipt for
      // the batch-43 reason and the button says so.
      stage: itemStage(x.r), supplyOnly: x.supplyOnly, moves: stageMoves(x.i, x.supplyOnly),
    }))
    .sort((a, b) => b.behind - a.behind || a.projectName.localeCompare(b.projectName));
  // ---- The two ways out of a late delivery, from the row itself (spec §3 / Fase 4) ----
  // Overview writes exactly like the timeline drag does. It reads report snapshots, so
  // leaving the change in the draft would show the row resolved while every table around
  // it still reported the old value until someone opened the Material List and hit Save —
  // so confirming IS the save, and the confirm text says so. Both calls are functional
  // setDb updates and the undo snapshot is taken before either, so one Undo reverts the
  // whole thing. There is deliberately no third way out: no snooze, no dismiss — either
  // the date moved or the material is here.
  const applyReschedule = (r: LateRow, iso: string) => {
    if (!iso || iso === r.promised) return;
    const ok = window.confirm(
      `Reschedule "${r.description}" — new Anticipated Ship/Delivery date ${fmtMDY(iso)}?`
      + `\n\nThis publishes ${r.wpLabel} to the report — any other pending edits in it go too. Undo is available right after.`,
    );
    if (!ok) return;
    // Writing shipDate by hand sets shipDateManual (applyItemPatch), which is exactly
    // right here: the vendor gave a real date and poDate + lead must not overwrite it.
    actions.editItem(r.itemId, { shipDate: iso });
    actions.savePackageToReport(r.wpId);
  };
  // Lote 64 — the publish notice stays, but the PM sets the date: registering isn't
  // witnessing, and the truck arrived Friday even if this gets logged Monday.
  const publishNote = (wpLabel: string) => (
    <>This publishes <strong>{wpLabel}</strong> to the report — any other pending edits in it go too. Undo is available right after.</>
  );
  /** Everything needed to move an item's stage from the board. The two windows offering
   * the buttons — ⏰ Late deliveries and the mosaic's package window — build this and the
   * rest is the same path: ask the date, write through the ONE stage writer (lote 40),
   * publish the package in the same gesture. */
  interface MoveCtx {
    itemId: string; wpId: string; wpLabel: string; description: string;
    supplyOnly: boolean; installVia: 'stage' | 'install-log' | '';
  }
  const promptStageMove = (m: MoveCtx, target: MoveTarget) => {
    const name = m.description || 'Untitled';
    if (target === 'warehouse') {
      setDatePrompt({
        title: <span>🏭 It arrived</span>,
        body: (
          <>
            "{name}" lands in 🏭 the warehouse on the date you set — move it on to 📍 on site or 🔩 installed from
            here or the Material List.<br /><br />{publishNote(m.wpLabel)}
          </>
        ),
        label: 'Received on',
        date: today(),
        confirmLabel: '🏭 Received',
        onConfirm: (iso) => { actions.setItemStage([m.itemId], 'warehouse', iso); actions.savePackageToReport(m.wpId); },
      });
      return;
    }
    if (target === 'on-site') {
      setDatePrompt({
        title: <span>📍 {m.supplyOnly ? 'Delivered to the jobsite' : 'On site'}</span>,
        body: m.supplyOnly
          ? <>"{name}" closes out 📍 on site — this package is supply only, so reaching the jobsite IS its finish line.<br /><br />{publishNote(m.wpLabel)}</>
          : <>"{name}" is at the jobsite. It stays open until it is installed.<br /><br />{publishNote(m.wpLabel)}</>,
        label: m.supplyOnly ? 'Delivered on' : 'On site since',
        date: today(),
        confirmLabel: '📍 On site',
        onConfirm: (iso) => { actions.setItemStage([m.itemId], 'on-site', iso); actions.savePackageToReport(m.wpId); },
      });
      return;
    }
    if (!m.installVia) return;
    setDatePrompt({
      title: <span>🔩 Installed</span>,
      body: (
        <>
          "{name}" closes out 🔩 installed
          {m.installVia === 'install-log' ? ', as one entry in its installation log covering every unit still pending' : ''}.
          <br /><br />{publishNote(m.wpLabel)}
        </>
      ),
      label: 'Installed on',
      date: today(),
      confirmLabel: '🔩 Installed',
      onConfirm: (iso) => closeOutItem(m.itemId, m.wpId, false, m.installVia as 'stage' | 'install-log', iso),
    });
  };
  const moveLateItem = (r: LateRow, target: MoveTarget) => promptStageMove({ ...r, installVia: r.moves.installVia }, target);

  // ---- 🚚 Partially delivered: close the backorder from its gauge (lote 63) ----
  const partialRows = enriched.filter((x) => hasOpenBackorder(x.r));
  const closeBackorder = (x: Enriched) => {
    const total = totalQty(x.r);
    if (total == null) return;
    const owed = total - (x.r.receivedQty || 0);
    setDatePrompt({
      title: <span>🚚 The rest arrived</span>,
      body: (
        <>
          Registers the <strong>{owed}{x.r.um ? ` ${x.r.um}` : ''}</strong> still owed on "{x.r.description || 'Untitled'}" as
          received and closes the backorder.<br /><br />{publishNote(x.pkg.label)}
        </>
      ),
      label: 'Balance received on',
      date: today(),
      confirmLabel: '✅ Received in full',
      onConfirm: (iso) => {
        if (logDrivesStage(x.i.deliveries)) {
          // The log owns the number here — the balance is one more entry, exactly like the
          // Breakdown Delivery modal registers one (batch 43/44).
          actions.addDelivery(x.i.id, owed, 'Closed from Overview', undefined, iso);
        } else {
          // No log: `receivedQty` is a QUANTITY, not the stage, so `editItem` closes it —
          // this does NOT touch delivered/siteDate/installed (CLAUDE.md §4). The date
          // travels in the SAME patch as the quantity and not as the `setItemStage` date
          // below: the stage re-affirmed can be on-site or installed, and there that date
          // would be read as the date OF THAT STAGE and overwrite one that already existed.
          const before = itemStage(x.r);
          actions.editItem(x.i.id, { receivedQty: total, receivedDate: iso });
          actions.setItemStage([x.i.id], 'warehouse');
          if (before === 'on-site' || before === 'installed') actions.setItemStage([x.i.id], before);
        }
        actions.savePackageToReport(x.pkg.id);
      },
    });
  };

  /** The close-out write, shared by the 🏭 gauge window, ⏰ Late deliveries and the
   * mosaic's package window: same decision on the same item, only where it's taken from
   * changes. */
  const closeOutItem = (itemId: string, wpId: string, supplyOnly: boolean, via: 'stage' | 'install-log', iso: string) => {
    if (via === 'install-log') {
      const it = db.items.find((i) => i.id === itemId);
      const room = it ? pendingInstallQty(it) : null;
      if (room == null || room <= 0) return;
      actions.addInstall(itemId, room, 'Closed out from Overview', iso);
    } else {
      actions.setItemStage([itemId], supplyOnly ? 'on-site' : 'installed', iso);
    }
    actions.savePackageToReport(wpId);
  };

  // ---- 🏭 Awaiting site / install: close the item from its gauge (lote 63) ----
  const closeAwaitingItem = (x: Enriched, stage: 'on-site' | 'installed') => {
    setDatePrompt({
      title: <span>{stage === 'on-site' ? '📍' : '🔩'} {stage === 'on-site' ? 'On site' : 'Installed'}</span>,
      body: (
        <>
          "{x.r.description || 'Untitled'}" closes out {stage === 'on-site' ? '📍 on site' : '🔩 installed'}.
          <br /><br />{publishNote(x.pkg.label)}
        </>
      ),
      label: stage === 'on-site' ? 'On site since' : 'Installed on',
      date: today(),
      confirmLabel: stage === 'on-site' ? '📍 On site' : '🔩 Installed',
      onConfirm: (iso) => { actions.setItemStage([x.i.id], stage, iso); actions.savePackageToReport(x.pkg.id); },
    });
  };

  // Buy-By within 14 days, grouped by project → work package.
  const due = enriched.filter((x) => x.c.buyby && x.c.days != null && x.c.days <= 14 && x.c.status !== 'ordered' && x.c.status !== 'partial' && x.c.status !== 'delivered');

  interface WpGroup { key: string; projectId: string; projectName: string; wpId: string; wpLabel: string; count: number; nearest: string; latest: string; overdue: boolean; status: ItemStatus; itemId: string; }
  interface ProjGroup { projectId: string; projectName: string; packages: number; count: number; nearest: string; latest: string; overdue: boolean; status: ItemStatus; }

  const wpGroups: WpGroup[] = (() => {
    const m = new Map<string, Enriched[]>();
    due.forEach((x) => {
      const k = `${x.projectId}|${x.pkg.id}`;
      const g = m.get(k); if (g) g.push(x); else m.set(k, [x]);
    });
    return [...m.entries()].map(([key, xs]) => {
      const sorted = [...xs].sort((a, b) => a.c.buyby.localeCompare(b.c.buyby));
      const top = [...xs].sort((a, b) => STATUS_RANK[b.c.status] - STATUS_RANK[a.c.status])[0];
      const project = db.projects.find((p) => p.id === xs[0].projectId)!;
      return {
        key, projectId: xs[0].projectId, projectName: project.name, wpId: xs[0].pkg.id, wpLabel: xs[0].pkg.label,
        count: xs.length, nearest: sorted[0].c.buyby, latest: sorted[sorted.length - 1].c.buyby,
        overdue: sorted[0].c.days != null && sorted[0].c.days <= 0, status: top.c.status, itemId: sorted[0].i.id,
      };
    }).sort((a, b) => a.nearest.localeCompare(b.nearest) || a.projectName.localeCompare(b.projectName));
  })();

  const projGroups: ProjGroup[] = (() => {
    const m = new Map<string, WpGroup[]>();
    wpGroups.forEach((g) => { const a = m.get(g.projectId); if (a) a.push(g); else m.set(g.projectId, [g]); });
    return [...m.values()].map((gs) => {
      const nearest = gs.map((g) => g.nearest).sort()[0];
      const latest = gs.map((g) => g.latest).sort().slice(-1)[0];
      const top = [...gs].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])[0];
      return {
        projectId: gs[0].projectId, projectName: gs[0].projectName, packages: gs.length,
        count: gs.reduce((s, g) => s + g.count, 0), nearest, latest,
        overdue: gs.some((g) => g.overdue), status: top.status,
      };
    }).sort((a, b) => a.nearest.localeCompare(b.nearest) || a.projectName.localeCompare(b.projectName));
  })();

  // Stage status by work package — EVERY package with published items, the same universe
  // the mosaic charts. It used to start at "has material in hand", which quietly excluded
  // most supply-only work: material that ships straight to the site closes on arrival, so
  // those packages were never *still open* and the default view dropped them. Scope is
  // read off the PACKAGE, not the project: a supply-only package closes at 📍 even inside
  // a supply-and-install project, and vice versa. (The project's flag only drives the
  // Portfolio grouping and the mosaic card's badge family.)
  const stageGroups: StageGroup[] = (() => {
    const m = new Map<string, Enriched[]>();
    enriched.forEach((x) => {
      const k = `${x.projectId}|${x.pkg.id}`;
      const g = m.get(k); if (g) g.push(x); else m.set(k, [x]);
    });
    return [...m.entries()].map(([key, xs]) => {
      const supplyOnly = xs[0].supplyOnly;
      // Three nested sets: everything, what hasn't closed (`open`), and the part of that
      // already here and waiting (`awaiting`).
      const open = xs.filter((x) => !isClosed(x.r, x.supplyOnly));
      const pend = xs.filter((x) => awaitingInstall(x.r, x.supplyOnly));
      const closed = xs.length - open.length;
      const at = (s: ItemStage) => xs.filter((x) => itemStage(x.r) === s).length;
      // Urgency and target date come from everything still open — including material that
      // hasn't shipped yet, whose Req. date is just as passed.
      const dated = open.filter((x) => x.r.onsite).sort((a, b) => a.r.onsite.localeCompare(b.r.onsite));
      const worst = open.map(awaitingUrgency).sort((a, b) => URGENCY_RANK[b] - URGENCY_RANK[a])[0] ?? 'scheduled';
      // Waiting stays about material IN HAND — something that never arrived hasn't been
      // waiting anywhere.
      const waits = pend.map((x) => daysWaiting(x.r)).filter((d): d is number => d != null);
      return {
        key, projectId: xs[0].projectId, projectName: db.projects.find((p) => p.id === xs[0].projectId)!.name,
        wpId: xs[0].pkg.id, wpLabel: xs[0].pkg.label,
        items: xs.length,
        warehouse: at('warehouse'),
        // 📍 always means "on site": still open there when we install, already closed out
        // when we don't (and then it's the 🔩 column that goes empty, not this one).
        site: supplyOnly ? closed : at('on-site'),
        installed: supplyOnly ? null : at('installed'),
        closed,
        awaiting: pend.length,
        open: open.length,
        nextOnsite: dated[0]?.r.onsite ?? '',
        urgency: worst,
        itemId: (dated[0] ?? open[0] ?? xs[0]).i.id,
        waited: waits.length ? Math.max(...waits) : null,
        rows: [...xs].sort((a, b) => (openWait(b) ?? -1) - (openWait(a) ?? -1)),
        supplyOnly,
      };
    }).sort((a, b) =>
      URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]
      || (a.nextOnsite || '9999').localeCompare(b.nextOnsite || '9999')
      || a.projectName.localeCompare(b.projectName));
  })();
  // One table for the whole portfolio: the mosaic covers both scopes, so the Detailed
  // view behind it has to as well, or half the cards would have no table to fall back to.
  // Scope is a per-ROW property here — it decides the closing stage, not which table
  // you are looking at. *Still open* = the package has items short of that stage,
  // wherever they physically are.
  const stageRows = stagePending ? stageGroups.filter((g) => g.open > 0) : stageGroups;
  const stageByProject = groupByProject(stageRows);
  const allStageCollapsed = stageByProject.length > 0 && stageByProject.every((p) => stageCollapsed[p.projectId]);
  // Re-read from the live groups, so the modal follows the data instead of a snapshot of
  // it. A package that empties out (last item closed out elsewhere) closes the modal.
  const drillGroup = drillKey ? stageGroups.find((g) => g.key === drillKey) ?? null : null;

  // ---- The mosaic: Delivery and installation status ----
  // The WHOLE portfolio, both scopes: a supply-only project asks the same question with a
  // different finish line, so it gets a card like everyone else and `mosaicCards` reads
  // each package's own closing stage. That is also why the section is not called
  // Installation status any more. Everything else is decided inside the function, which is
  // pure so the sorting and the 0/100% edges stay testable; here we only feed it.
  const mosaicPackages = db.packages.filter((p) => activeIds.has(p.projectId));
  const mosaic = mosaicCards(activeProjects, mosaicPackages, db.items);
  const drillCard = badgeDrill ? mosaic.find((c) => c.projectId === badgeDrill.projectId) ?? null : null;

  // ---- The window a mosaic package bar opens (lote 64) ----
  // The bar already summarises Delivery & installation status for that package's items —
  // clicking it opens that summary's detail instead of sending the PM to hunt it down in
  // the Material List. Rows are rebuilt here on every render, so the window updates itself
  // right after each write.
  const pkgModalPkg = pkgModal ? db.packages.find((p) => p.id === pkgModal.wpId) ?? null : null;
  const pkgModalSupplyOnly = pkgModalPkg ? closesAtSite(pkgModalPkg, db.projects.find((p) => p.id === pkgModalPkg.projectId)) : false;
  const pkgRows: PackageItemRow[] = pkgModalPkg
    ? enriched
      .filter((x) => x.pkg.id === pkgModalPkg.id)
      .map((x): PackageItemRow => {
        const stage = itemStage(x.r);
        return {
          key: x.i.id, itemId: x.i.id, description: x.r.description, qty: x.r.qty, um: x.r.um,
          stage,
          stageDate: stage === 'installed' ? x.r.installedDate : stage === 'on-site' ? x.r.siteDate : stage === 'warehouse' ? x.r.receivedDate : '',
          onsite: x.r.onsite, urgency: awaitingUrgency(x),
          closed: isClosed(x.r, x.supplyOnly),
          backorder: hasOpenBackorder(x.r) ? backorderQty(x.r) : null,
          // Against the live DRAFT, which is what `stagePatch` will see.
          moves: stageMoves(x.i, x.supplyOnly),
        };
      })
      // What's still open first, most urgent within that: the window exists to move
      // material along, so what CAN move sits on top.
      .sort((a, b) => Number(a.closed) - Number(b.closed)
        || URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]
        || (a.onsite || '9999').localeCompare(b.onsite || '9999'))
    : [];

  /** A move requested from the package window — same path as from ⏰, only the package
   * and scope come from the modal instead of the row. */
  const movePkgItem = (row: PackageItemRow, target: MoveTarget) => {
    if (!pkgModalPkg) return;
    promptStageMove({
      itemId: row.itemId, wpId: pkgModalPkg.id, wpLabel: pkgModalPkg.label,
      description: row.description, supplyOnly: pkgModalSupplyOnly, installVia: row.moves.installVia,
    }, target);
  };

  // ---- The quick edit (lote 64): fill in the data the board is counting ----
  // Values come off the DRAFT (`x.i`), not the report — they're what the fields are about
  // to patch. The LIST, though, is chosen by the published status, which is what the board
  // counted.
  const quickRows: QuickEditRow[] = quickEdit
    ? quickEdit.ids
      .map((id) => enriched.find((x) => x.i.id === id))
      .filter((x): x is Enriched => !!x)
      .map((x) => ({
        key: x.i.id, itemId: x.i.id, wpId: x.pkg.id, wpLabel: x.pkg.label,
        description: x.i.description, qty: x.i.qty, um: x.i.um, status: x.c.status,
        lead: x.i.lead, onsite: x.i.onsite, po: x.i.po, poDate: x.i.poDate,
      }))
    : [];
  const saveQuickEdit = (changes: { itemId: string; wpId: string; patch: Partial<QuickEditPatch> }[]) => {
    // One `editItem` per item, one publish per PACKAGE. Every call is a functional setDb
    // update and the Undo snapshot is taken before the first one, so a single Undo
    // reverts the whole batch.
    changes.forEach((c) => actions.editItem(c.itemId, c.patch));
    [...new Set(changes.map((c) => c.wpId))].forEach((wpId) => actions.savePackageToReport(wpId));
    setQuickEdit(null);
  };

  // Portfolio count columns: tighter side padding so the Complete bar (which has to fit
  // its numbers inside) keeps a usable width at half-screen.
  // whiteSpace normal so "ORDER NOW" / "Needs data" wrap to two lines instead of forcing
  // the table past its half-width container.
  // Portfolio count columns: tighter side padding so the Complete bar (which has to fit
  // its numbers inside) keeps a usable width. whiteSpace normal so "ORDER NOW" / "Needs
  // data" wrap to two lines instead of forcing the table past its container at a narrow
  // viewport.
  const thN: CSSProperties = { ...th, padding: '9px 8px', whiteSpace: 'normal' };
  const tdN: CSSProperties = { ...td, padding: '10px 8px' };
  const jumpProject = (id: string) => { setActiveProjectId(id); nav('list'); };
  // A Portfolio count opens the quick edit for THOSE items — the Portfolio is the summary
  // by status, and the status of almost every one of them hinges on four fields. If the
  // number is the cover of a list, the list should be actionable where it's read.
  const openStatusEdit = (projectId: string, projectName: string, status: ItemStatus, label: string) => {
    const ids = enriched.filter((x) => x.projectId === projectId && x.c.status === status).map((x) => x.i.id);
    if (!ids.length) return;
    setQuickEdit({
      title: `${projectName} · ${label}`,
      caption: `${ids.length} item${ids.length === 1 ? '' : 's'} counted under ${label}.`,
      ids,
      variant: 'full',
    });
  };
  /** A mosaic badge. The three physical ones still open the read-only drill-down; **🛒 opens
   * the quick edit in the `'po'` variant** instead — the badge counts exactly what's missing
   * a PO, so the window that lists it has to be able to write one. Lead and On-Site aren't
   * offered here: an unbought item may not have them yet, and the question this badge asks
   * is the order, not the schedule. Publishes on save, like every Overview write. */
  const openBadge = (projectId: string, key: MosaicBadgeKey) => {
    if (key !== 'not-ordered') { setBadgeDrill({ projectId, key }); return; }
    const card = mosaic.find((c) => c.projectId === projectId);
    const items = card?.badges.find((b) => b.key === key)?.items ?? [];
    if (!card || !items.length) return;
    setQuickEdit({
      title: `${card.projectName} · 🛒 ${items.length} with no PO# yet`,
      caption: `${items.length} item${items.length === 1 ? '' : 's'} nobody has bought yet, by work package. Already ordered? Write the PO # and its date here.`,
      ids: items.map((x) => x.id),
      variant: 'po',
    });
  };
  /** The Buy-By table's count, the other half of the same request: register the PO and
   * its date without leaving the board. Same window, different trigger — and in the `'po'`
   * variant, because an item that already has a buy-by has Lead and On-Site loaded by
   * definition: the only thing missing here is the order. */
  const openBuyByEdit = (title: string, rows: Enriched[]) => {
    if (!rows.length) return;
    setQuickEdit({
      title,
      caption: `${rows.length} item${rows.length === 1 ? '' : 's'} to order within the next 14 days — a PO # here takes them off the list.`,
      ids: rows.map((x) => x.i.id),
      variant: 'po',
    });
  };
  // `--alert-ink`: la fecha vencida se pinta sobre `--canvas`, sin pastel debajo.
  const buyByCell = (overdue: boolean): CSSProperties => ({ ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, color: overdue ? 'var(--alert-ink)' : 'var(--ink)' });
  /** One Portfolio count cell. At zero it prints the bare number — a button opening an
   * empty list is a button that lies. */
  const countCell = (row: (typeof portfolio)[number], value: number, status: ItemStatus, label: string, cell: CSSProperties) => (
    <td style={cell}>
      {value > 0 ? (
        <button
          type="button"
          className="ov-count"
          title={`${value} ${label} in ${row.project.name} — fill in lead time, On-Site Req., PO # and PO date right here`}
          onClick={(e) => { e.stopPropagation(); openStatusEdit(row.project.id, row.project.name, status, label); }}
        >
          {value}
        </button>
      ) : value}
    </td>
  );
  const rangeText = (nearest: string, latest: string) => (nearest === latest ? fmtMDY(nearest) : `${fmtMDY(nearest)} → ${fmtMDY(latest)}`);
  /** Closes a clock modal — unless a date is being asked for on top of it: both listen for
   * Escape on `document`, so without this guard one keypress closed both. */
  const dismissClockModal = (close: () => void) => () => { if (!datePrompt) close(); };

  // One group-by control, two independent tables (Buy-By and Late deliveries) — same
  // wording both times so the toggle reads as the same idea in both places.
  const groupBtns = (value: 'wp' | 'project', set: (m: 'wp' | 'project') => void) => (
    <>
      <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600 }}>Group by:</span>
      {([['wp', 'Project · Work package'], ['project', 'Project']] as const).map(([mode, label]) => (
        <Button
          key={mode}
          size="sm"
          variant={value === mode ? 'primary' : 'secondary'}
          onClick={() => set(mode)}
          style={{ padding: '5px 12px' }}
        >
          {label}
        </Button>
      ))}
    </>
  );

  // ---- El riel de indicadores, agrupado por los TRES RELOJES del motor ----
  // Cada gauge trae UNA línea de desglose y, opcionalmente, una de alarma; el hueco de la
  // segunda se reserva siempre (ver `Gauge`) para que el riel no cambie de alto cuando la
  // última alarma se resuelve.
  const blockedTop = BLOCK_CATS.filter((c) => blockedByCat[c] > 0).sort((a, b) => blockedByCat[b] - blockedByCat[a]);
  const blockedLine = blockedTotal === 0
    ? 'nothing blocked — all clear'
    : blockedTop.slice(0, 2).map((c) => `${BLOCK_SHORT[c]} ${blockedByCat[c]}`).join(' · ')
      + (blockedTop.length > 2 ? ` · +${blockedTop.length - 2}` : '');
  // `--alert-ink` / `--warn-ink` y NO la tinta del semáforo: estas líneas se leen sobre
  // `--canvas`, no sobre un pastel.
  const awaitAlert: GaugeLine | undefined = installOverdue > 0 || installUnscheduled > 0
    ? {
        text: [installOverdue > 0 ? `⚠ ${installOverdue} past date` : '', installUnscheduled > 0 ? `❔ ${installUnscheduled} no date` : ''].filter(Boolean).join(' · '),
        tone: installOverdue > 0 ? 'var(--alert-ink)' : 'var(--warn-ink)',
      }
    : undefined;

  // The three purchasing gauges open the Material List with its status filter already
  // set (lote 63) — `presetListFilter` writes the same `usePersisted` key the screen
  // reads on mount, so the PM lands on the exact slice the number promised instead of
  // the whole list.
  const openListFiltered = (keys: ItemStatus[]) => { presetListFilter(keys); nav('list'); };
  const buyClock: GaugeProps[] = [
    {
      icon: '🔴', label: 'ORDER NOW', value: totalOrderNow,
      title: 'Items already past their buy-by date — open the Material List, filtered',
      onClick: () => openListFiltered(['order-now']),
      fill: totalOrderNow ? 'var(--status-order-now)' : undefined,
      ink: totalOrderNow ? 'var(--status-order-now-ink)' : undefined,
      accent: totalOrderNow ? 'var(--status-order-now-ink)' : undefined,
      lines: [
        { text: totalOrderNow ? 'past the buy-by date' : 'nothing past its buy-by' },
        blockedNow > 0 ? { text: `⛔ ${blockedNow} blocked by submittal` } : undefined,
      ],
    },
    {
      icon: '🟠', label: 'Order soon', value: statusTotals['order-soon'],
      title: 'Items whose buy-by date falls inside the order-soon window — open the Material List, filtered',
      onClick: () => openListFiltered(['order-soon']),
      fill: 'var(--status-order-soon)', ink: 'var(--status-order-soon-ink)', accent: 'var(--status-order-soon-ink)',
      lines: [
        { text: 'inside the order-soon window' },
        blockedSoon > 0 ? { text: `⛔ ${blockedSoon} blocked by submittal` } : undefined,
      ],
    },
    {
      icon: '⛔', label: 'Blocked by submittal', value: blockedTotal,
      title: blockedTotal
        ? `Waiting on a submittal component:\n${BLOCK_CATS.filter((c) => blockedByCat[c] > 0).map((c) => `· ${c} ${blockedByCat[c]}`).join('\n')}\n\nOpen Submittals`
        : 'Nothing is waiting on a submittal — open Submittals',
      onClick: () => nav('submittals'),
      accent: blockedTotal ? 'var(--brand-orange)' : undefined,
      lines: [
        { text: blockedLine },
        blockedNow > 0 ? { text: `⚠ ${blockedNow} past buy-by — expedite`, tone: 'var(--alert-ink)' } : undefined,
      ],
    },
    {
      icon: '❔', label: 'Needs data', value: needsData,
      title: 'Items the buy-by date cannot be calculated for — open the Material List, filtered',
      onClick: () => openListFiltered(['needs-data']),
      accent: needsData ? 'var(--border-strong)' : undefined,
      lines: [{ text: `${missingLead} no lead · ${missingOnsite} no on-site` }],
    },
  ];
  const transitClock: GaugeProps[] = [
    {
      icon: '⏰', label: 'Late deliveries', value: lateRows.length,
      title: 'Bought, promised for a date that has passed, still not here — open the list',
      onClick: () => setShowLate(true),
      accent: lateRows.length ? 'var(--alert-ink)' : undefined,
      lines: [{
        text: lateRows.length ? `worst is ${lateRows[0].behind} day${lateRows[0].behind === 1 ? '' : 's'} late` : 'every promised date holds',
        tone: lateRows.length ? 'var(--alert-ink)' : undefined,
      }],
    },
    {
      icon: '🚚', label: 'Partially delivered', value: statusTotals.partial,
      title: 'Items with part of the order still on backorder — open the list',
      onClick: () => setShowPartial(true),
      accent: statusTotals.partial ? 'var(--warn-ink)' : undefined,
      lines: [{ text: 'open backorders' }],
    },
  ];
  const closeClock: GaugeProps[] = [
    {
      icon: '🏭', label: hasSupplyOnly ? 'Awaiting site / install' : 'Awaiting installation',
      value: awaiting.length,
      title: 'Material paid for and in hand that has not reached its last stage — open the list',
      onClick: () => setShowAwaiting(true),
      accent: installOverdue > 0 ? 'var(--alert-ink)' : installUnscheduled > 0 ? 'var(--warn-ink)' : undefined,
      lines: [{ text: `${inWarehouse} warehouse · ${onSite} on site` }, awaitAlert],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {/* ---------------------------------------------------- 1. Masthead a todo ancho */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '2px solid var(--border-strong)' }}>
        <h1 style={{ margin: 0, font: 'var(--text-display-xl)', fontSize: 56, lineHeight: 1.05, color: 'var(--title)', fontWeight: 600 }}>Overview</h1>
        <span style={{ flex: 1, minWidth: 0 }} />
        <div style={{ font: 'var(--text-title-sm)', color: 'var(--muted)', fontWeight: 500 }}>{fmtLong(today())}</div>
      </header>

      {/* ------------------------------------------------ 2. El riel de indicadores */}
      <div className="ov-rail">
        <ClockGroup label="Buy" items={buyClock} />
        <ClockGroup label="In transit" items={transitClock} />
        <ClockGroup label="Close out" items={closeClock} />
      </div>

      {/* ------------------------------------------------------- 3. Timeline, full width */}
      <section>
        <SectionHead
          icon="🗓"
          title="Timeline"
          caption={<>6 months from today · hover for detail · click to open · <strong>drag a dot to reschedule</strong> · click a ◆ once measured</>}
          captionTitle="Fixed 6-month window from today. Overdue Req. dates show only when they still have ORDER NOW items, and are pinned to today; an unconfirmed ◆ field-measure visit is always pinned there. Confirming a drag — or a ◆ — publishes the package to the report, no second save needed."
          right={<TimelineLegend />}
        />
        <ReqDateTimeline lanes={lanes} onJumpItem={jumpToItem} onJumpProject={jumpProject} onSetDate={setMilestoneDate} onConfirmFm={confirmFieldMeasure} />
      </section>

      {/* --------------------- 4. Installation status & What to watch share a row */}
      {/* ⏰ Late deliveries used to occupy half of this band for a list that's almost
          always empty (lote 63) — it now opens from its own gauge instead. What's left
          shares a row under the timeline: the mosaic in the wide column, the Buy-By
          table in the narrow one. */}
      <Band label="Delivery, installation & what to watch">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 620px', minWidth: 340 }}>
            <SectionHead
              icon="🏗"
              title="Installation status"
              caption={installView === 'mosaic'
                ? 'Every project, one bar per package — solid is closed out: 🔩 installed, or 📍 on site where we only supply. Click a bar to move its items along, a badge for its list.'
                : 'Every package, by project — both scopes, each measured against its own finish line. 🏭 · 📍 · 🔩 say where the material stands; Waiting counts days since it was received. Click an item count for the per-item list.'}
              right={(
                <>
                  {installView === 'table' && (
                    <>
                      <Button size="sm" variant={stagePending ? 'primary' : 'secondary'} onClick={() => setStagePending(true)} style={{ padding: '5px 10px' }}>Still open</Button>
                      <Button size="sm" variant={!stagePending ? 'primary' : 'secondary'} onClick={() => setStagePending(false)} style={{ padding: '5px 10px' }}>All packages</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={stageByProject.length === 0}
                        onClick={() => {
                          const target = !allStageCollapsed;
                          setStageCollapsed(Object.fromEntries(stageByProject.map((p) => [p.projectId, target])));
                        }}
                        style={{ padding: '4px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}
                      >
                        {allStageCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant={installView === 'mosaic' ? 'primary' : 'secondary'} onClick={() => setInstallView('mosaic')} style={{ padding: '5px 10px' }}>▦ Mosaic</Button>
                  <Button size="sm" variant={installView === 'table' ? 'primary' : 'secondary'} onClick={() => setInstallView('table')} style={{ padding: '5px 10px' }}>▤ Detailed</Button>
                </>
              )}
            />
            {installView === 'mosaic' ? (
              <InstallMosaic
                cards={mosaic}
                empty="No work packages with items yet — the mosaic fills in as material is added and published."
                onJumpProject={jumpProject}
                onOpenPackage={(projectId, wpId) => setPkgModal({ projectId, wpId })}
                onBadgeDrill={openBadge}
              />
            ) : (
              <StageTable
                blocks={stageByProject}
                collapsed={stageCollapsed}
                onToggle={toggleStage}
                onJumpProject={jumpProject}
                onJumpItem={jumpToItem}
                onDrill={(g) => setDrillKey(g.key)}
                empty={stagePending ? 'Nothing open — every received item reached its finish line.' : 'No material received yet.'}
              />
            )}
          </div>

          <div style={{ flex: '1 1 360px', minWidth: 320 }}>
            <SectionHead
              icon="📅"
              title="Buy-By dates in the next 14 days"
              caption="Order these to hold the On-Site Req. date. Click a row to open the item."
              right={groupBtns(groupMode, setGroupMode)}
            />
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  {groupMode === 'wp' ? (
                    <tr style={{ background: 'var(--surface-soft)' }}>
                      <th style={thL}>Project</th><th style={thL}>Work package</th><th style={th}>Items</th>
                      <th style={thL}>Nearest Buy-By</th><th style={thL}>Most urgent</th><th style={{ ...th, width: 36 }} />
                    </tr>
                  ) : (
                    <tr style={{ background: 'var(--surface-soft)' }}>
                      <th style={thL}>Project</th><th style={th}>Packages</th><th style={th}>Items</th>
                      <th style={thL}>Nearest Buy-By</th><th style={thL}>Most urgent</th><th style={{ ...th, width: 36 }} />
                    </tr>
                  )}
                </thead>
                <tbody>
                  {groupMode === 'wp' && wpGroups.map((g) => (
                    <tr
                      key={g.key}
                      onClick={() => jumpToItem(g.projectId, g.itemId)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={tdL}>{g.projectName}</td>
                      <td style={{ ...tdL, color: 'var(--muted)' }}>{g.wpLabel}</td>
                      {/* Opens the quick edit for this group (lote 64): registering the PO
                          and its date is what takes these items off the list, and it was
                          the one reason left to leave the board from here. */}
                      <td style={td}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={`${g.count} item${g.count === 1 ? '' : 's'} — register the PO # and PO date without leaving the board`}
                          onClick={(e) => { e.stopPropagation(); openBuyByEdit(`${g.projectName} · ${g.wpLabel}`, due.filter((x) => x.pkg.id === g.wpId)); }}
                          style={{ padding: '2px 9px', font: 'var(--text-mono)', fontWeight: 700 }}
                        >
                          {g.count}
                        </Button>
                      </td>
                      <td style={buyByCell(g.overdue)}>{rangeText(g.nearest, g.latest)}</td>
                      <td style={tdL}><StatusBadge status={g.status} /></td>
                      <td style={{ ...td, color: 'var(--muted)', textAlign: 'center' }}>›</td>
                    </tr>
                  ))}
                  {groupMode === 'project' && projGroups.map((g) => (
                    <tr
                      key={g.projectId}
                      onClick={() => jumpProject(g.projectId)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={tdL}>{g.projectName}</td>
                      <td style={td}>{g.packages}</td>
                      <td style={td}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={`${g.count} item${g.count === 1 ? '' : 's'} — register the PO # and PO date without leaving the board`}
                          onClick={(e) => { e.stopPropagation(); openBuyByEdit(g.projectName, due.filter((x) => x.projectId === g.projectId)); }}
                          style={{ padding: '2px 9px', font: 'var(--text-mono)', fontWeight: 700 }}
                        >
                          {g.count}
                        </Button>
                      </td>
                      <td style={buyByCell(g.overdue)}>{rangeText(g.nearest, g.latest)}</td>
                      <td style={tdL}><StatusBadge status={g.status} /></td>
                      <td style={{ ...td, color: 'var(--muted)', textAlign: 'center' }}>›</td>
                    </tr>
                  ))}
                  {due.length === 0 && <tr><td colSpan={6} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>No buy-by dates within 14 days.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Band>

      {/* -------------------------------------------------- 6. Portfolio, full width */}
      <Band label="Portfolio">
        <SectionHead
          title={`Every project by status${hasSupplyOnly ? ', grouped by scope' : ''}`}
          caption={<>The Complete bar reads <strong>closed out</strong> (solid) then <strong>received, not closed</strong> (light) · hover it for the counts</>}
          captionTitle={`Every project by status${hasSupplyOnly ? ', grouped by scope' : ''}. The Complete bar reads closed out (solid) then received, not closed (light) — each package is measured against its own last stage, 🔩 installed or 📍 on site.`}
        />
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft)' }}>
                <th style={thL}>Project</th><th style={thN}>Items</th>
                <th style={thN}>ORDER NOW</th><th style={thN}>Order soon</th><th style={thN}>Needs data</th>
                <th style={thN}>Planned</th><th style={thN}>Ordered</th><th style={thN}>Partial</th>
                <th style={{ ...thL, width: 172 }}>Complete</th>
              </tr>
            </thead>
            <tbody>
              {portfolioSections.map((section) => (
                <Fragment key={section.title}>
                  {hasSupplyOnly && (
                    <tr style={{ background: 'var(--surface-soft)' }}>
                      <td colSpan={9} style={{ ...tdL, font: 'var(--text-caption)', fontWeight: 700, letterSpacing: 0.6, color: 'var(--muted)' }}>
                        {section.title}
                      </td>
                    </tr>
                  )}
                  {section.rows.map((p) => {
                    const empty = p.items === 0;
                    return (
                      <tr
                        key={p.project.id}
                        onClick={() => jumpProject(p.project.id)}
                        style={{ cursor: 'pointer', background: empty ? 'color-mix(in srgb, var(--status-order-soon) 48%, var(--canvas))' : undefined }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = empty ? 'color-mix(in srgb, var(--status-order-soon) 48%, var(--canvas))' : 'transparent'; }}
                      >
                        <td style={tdL}>{p.project.name}{empty && <span style={{ font: 'var(--text-caption)', color: 'var(--warn-ink)', fontWeight: 600, marginLeft: 8 }}>⚠ no items yet</span>}</td>
                        <td style={{ ...tdN, fontWeight: 600 }}>{p.items}</td>
                        {/* The six counts are buttons (lote 64): they open the quick edit
                            for those items. */}
                        {countCell(p, p.orderNow, 'order-now', 'ORDER NOW', { ...tdN, background: p.orderNow ? 'var(--status-order-now)' : undefined, color: p.orderNow ? 'var(--status-order-now-ink)' : 'var(--muted)', fontWeight: p.orderNow ? 600 : 400 })}
                        {countCell(p, p.soon, 'order-soon', 'Order soon', { ...tdN, background: p.soon ? 'var(--status-order-soon)' : undefined, color: p.soon ? 'var(--status-order-soon-ink)' : 'var(--muted)' })}
                        {countCell(p, p.needs, 'needs-data', 'Needs data', { ...tdN, background: p.needs ? 'var(--status-needs-data)' : undefined, color: p.needs ? 'var(--status-needs-data-ink)' : 'var(--muted)' })}
                        {countCell(p, p.planned, 'planned', 'Planned', { ...tdN, color: 'var(--muted)' })}
                        {countCell(p, p.ordered, 'ordered', 'Ordered', { ...tdN, color: p.ordered ? 'var(--status-ordered-ink)' : 'var(--muted)' })}
                        {countCell(p, p.partial, 'partial', 'Partial', { ...tdN, background: p.partial ? 'var(--status-partial)' : undefined, color: p.partial ? 'var(--status-partial-ink)' : 'var(--muted)' })}
                        <td style={{ ...tdL }}>
                          <InstallBar
                            closed={p.closed}
                            awaiting={p.awaiting}
                            total={p.items}
                            title={`${p.closed} closed out · ${p.awaiting} received, not closed · ${p.items} items`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      {drillGroup && (
        <PackageDrillModal group={drillGroup} onClose={() => setDrillKey(null)} onJumpItem={jumpToItem} />
      )}
      {drillCard && badgeDrill && (
        <BadgeDrillModal card={drillCard} badge={badgeDrill.key} onClose={() => setBadgeDrill(null)} onJumpItem={jumpToItem} />
      )}
      {/* `dismissClockModal` guards against the window behind a date prompt closing along
          with it — both listen for Escape on `document`. */}
      {showLate && (
        <LateDeliveriesModal
          rows={lateRows}
          onClose={dismissClockModal(() => setShowLate(false))}
          onJumpItem={jumpToItem}
          onReschedule={applyReschedule}
          onMove={moveLateItem}
        />
      )}
      {showPartial && (
        <PartialDeliveryModal
          rows={partialRows}
          onClose={dismissClockModal(() => setShowPartial(false))}
          onJumpItem={jumpToItem}
          onCloseBackorder={closeBackorder}
        />
      )}
      {showAwaiting && (
        <AwaitingCloseModal
          rows={awaiting}
          onClose={dismissClockModal(() => setShowAwaiting(false))}
          onJumpItem={jumpToItem}
          onCloseItem={closeAwaitingItem}
        />
      )}

      {/* The mosaic's package window (lote 64) and the quick edit — mounted only while
          open, same as the three above. */}
      {pkgModalPkg && pkgModal && (
        <PackageCloseOutModal
          projectName={db.projects.find((p) => p.id === pkgModal.projectId)?.name ?? ''}
          wpLabel={pkgModalPkg.label}
          supplyOnly={pkgModalSupplyOnly}
          rows={pkgRows}
          onClose={() => { if (!datePrompt) setPkgModal(null); }}
          onJumpItem={(itemId) => jumpToItem(pkgModal.projectId, itemId)}
          onJumpPackage={() => { setPkgModal(null); jumpToItem(pkgModal.projectId, pkgRows[0]?.itemId ?? ''); }}
          onMove={movePkgItem}
        />
      )}
      {quickEdit && (
        <ItemQuickEditModal
          title={quickEdit.title}
          caption={quickEdit.caption}
          variant={quickEdit.variant}
          rows={quickRows}
          onClose={() => setQuickEdit(null)}
          onJumpItem={(itemId) => {
            const row = quickRows.find((r) => r.itemId === itemId);
            const pid = row ? db.packages.find((p) => p.id === row.wpId)?.projectId : undefined;
            if (pid) jumpToItem(pid, itemId);
          }}
          onSave={saveQuickEdit}
        />
      )}

      {/* Last in the tree on purpose: it shares its z-index with the other board modals,
          so DOM order is what keeps it on top. */}
      {datePrompt && (
        <ConfirmDateModal
          prompt={{ ...datePrompt, onConfirm: (iso) => { setDatePrompt(null); datePrompt.onConfirm(iso); } }}
          onCancel={() => setDatePrompt(null)}
        />
      )}
    </div>
  );
}

