// InstallMosaic.tsx — the Delivery and installation status mosaic: one card per project,
// one horizontal bar per work package. Solid = reached the end of the line, light = still
// on its way. It replaces the row-per-package table for the question the table answered
// badly — *which project needs attention, and which package in it?* — and keeps the table
// one click away for the one it answered well (dates, counts, per-stage detail).
//
// The whole portfolio is here, both scopes: a supply-only project has the same question
// and a different finish line. Its card ends at 📍 on site instead of 🔩 installed, its bar
// keeps a third zone for material nobody has ordered yet, and its badge row swaps "where is
// it standing" for "what is holding it up" (see `MosaicBadgeKey` in logic.ts).
//
// Two rules give the mosaic its shape and are easy to undo by accident:
//   · Colour means PROJECT, never status. The six hues rotate by a stable hash of the
//     project id, so a card keeps its colour while its percentage moves it around the
//     grid. Status is carried by the bar, the number and the flag.
//   · Bar widths compare WITHIN a card only — a package's width is its share of the
//     biggest package in the same project. Across cards a three-item project would be a
//     stub; the header rollup already says how big each project is.
//
// The aggregation is not here: `mosaicCards` in logic.ts is pure and tested, this file
// only draws it.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MOSAIC_BADGE_META, type MosaicBadgeKey, type MosaicCard, type MosaicPackage, type PackageProgressFlag } from '../store/logic';

/** Soft cap on cards per row (ported from the private build's lote 64) — a PM realistically
 * runs a portfolio of a handful to twenty projects, so more ROWS reads better than
 * squeezing more, thinner columns into fewer rows. */
const MAX_COLS = 5;
/** Below this width a card stops being legible — the cap yields to it. */
const CARD_FLOOR = 226;
const GRID_GAP = 14;

/** The six identity hues, in slot order — `MOSAIC_SLOTS` in logic.ts must stay this long. */
const SLOTS = [
  { solid: 'var(--mos-blue)', soft: 'var(--mos-blue-soft)', ink: 'var(--mos-blue-ink)' },
  { solid: 'var(--mos-orange)', soft: 'var(--mos-orange-soft)', ink: 'var(--mos-orange-ink)' },
  { solid: 'var(--mos-violet)', soft: 'var(--mos-violet-soft)', ink: 'var(--mos-violet-ink)' },
  { solid: 'var(--mos-magenta)', soft: 'var(--mos-magenta-soft)', ink: 'var(--mos-magenta-ink)' },
  { solid: 'var(--mos-aqua)', soft: 'var(--mos-aqua-soft)', ink: 'var(--mos-aqua-ink)' },
  { solid: 'var(--mos-gray)', soft: 'var(--mos-gray-soft)', ink: 'var(--mos-gray-ink)' },
];

/** Flag → what it says beside the package name. `--muted` for the truck on purpose: it is
 * not a verdict on the crew, it explains that the question belongs to procurement. */
const FLAG: Record<Exclude<PackageProgressFlag, null>, { icon: string; text: string; color: string; title: string }> = {
  complete: { icon: '✓', text: 'complete', color: 'var(--mos-flag-done)', title: 'Every item in this package is installed' },
  'not-started': { icon: '⚠', text: 'not started', color: 'var(--mos-flag-stalled)', title: 'The material is in hand and none of it is up yet — an installation problem' },
  'awaiting-delivery': { icon: '🚚', text: 'awaiting delivery', color: 'var(--muted)', title: 'Nothing has arrived yet — a procurement problem, not an installation one' },
};

const BAR_H = 22;
const PCT_W = 40; // the % column: fixed, so the numbers line up under each other even
                  // though the bars beside them are deliberately ragged

/** Up to five descriptions, then a count — the badge tooltip. */
function listTip(items: { description: string }[], label: string): string {
  if (!items.length) return `Nothing ${label}`;
  const head = items.slice(0, 5).map((x) => `· ${x.description || 'Untitled'}`);
  const rest = items.length - head.length;
  return [`${items.length} ${label}:`, ...head, ...(rest > 0 ? [`…+${rest} more`] : []), '', 'Click for the full list'].join('\n');
}

function PackageBar({ pkg, slot, scope, widest, trackW, trackRef, onOpen, openHint }: {
  pkg: MosaicPackage;
  slot: typeof SLOTS[number];
  scope: MosaicCard['scope'];
  widest: number;
  trackW: number;
  trackRef?: React.Ref<HTMLSpanElement>;
  onOpen: () => void;
  openHint: string;
}) {
  const share = widest ? pkg.total / widest : 1;
  // Two zones when we install (closed / everything else) and THREE when we only supply:
  // there the bar's job is "how much is bought, how much has landed", so material nobody
  // has ordered stays outside both fills instead of hiding inside the pending one. The
  // 🛒 badge below counts exactly that leftover.
  const supply = scope === 'supply';
  const unordered = supply ? pkg.pending - pkg.ordered : 0;
  const mid = supply ? pkg.ordered : pkg.pending;
  const f = (n: number) => (pkg.total ? n / pkg.total : 0);
  // Real pixels, not the raw share: 18% of a bar clamped to its 60px minimum is 11px, and
  // no two-digit number fits there. The 18% rule keeps the segment from looking crowded,
  // the pixel check keeps the glyphs from being cut — both have to pass, and the count
  // that loses is still in the tooltip and in the % beside it.
  const barPx = trackW ? Math.max(60, trackW * share) : 0;
  const fits = (frac: number, n: number) => n > 0 && frac >= 0.18 && barPx * frac >= String(n).length * 7 + 8;
  const flag = pkg.flag ? FLAG[pkg.flag] : null;
  const seg = (frac: number, bg: string, ink: string): CSSProperties => ({
    width: `${frac * 100}%`, height: '100%', background: bg, color: ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    font: 'var(--text-mono-sm)', fontSize: 11, fontWeight: 700, overflow: 'hidden',
  });
  const counts = supply
    ? `${pkg.closed} of ${pkg.total} on site · ${pkg.ordered} bought and still coming · ${unordered} not ordered yet`
    : `${pkg.closed} of ${pkg.total} installed · ${pkg.pending} pending`;
  return (
    <button
      type="button"
      className="mos-row"
      onClick={onOpen}
      title={`${pkg.wpLabel}\n${counts}${pkg.inHand ? `\n${pkg.inHand} received so far` : ''}\n\n${openHint}`}
    >
      <span className="mos-row-name">
        <span className="mos-row-label">{pkg.wpLabel}</span>
        {flag && (
          <span style={{ color: flag.color, fontWeight: 700, whiteSpace: 'nowrap' }} title={flag.title}>
            {flag.icon} {flag.text}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span ref={trackRef} style={{ flex: 1, minWidth: 0, display: 'block' }}>
          <span
            style={{
              display: 'flex', width: `max(60px, ${share * 100}%)`, height: BAR_H,
              borderRadius: 4, overflow: 'hidden',
              // Only the supply bar leaves a track showing, and only where nothing was
              // bought. On an install bar the two fills always add up to the whole width.
              background: 'var(--surface-strong)',
            }}
          >
            {/* The count sits in white on the solid segment. Three of the six hues land
                under 4.5:1 against white at this size, so the glyph carries its own edge
                instead — the alternative was retuning a palette that is about identity. */}
            <span style={{ ...seg(f(pkg.closed), slot.solid, '#ffffff'), textShadow: '0 1px 1.5px rgba(0,0,0,0.45)' }}>
              {fits(f(pkg.closed), pkg.closed) ? pkg.closed : ''}
            </span>
            <span style={seg(f(mid), slot.soft, slot.ink)}>
              {fits(f(mid), mid) ? mid : ''}
            </span>
          </span>
        </span>
        <span
          style={{
            width: PCT_W, flexShrink: 0, textAlign: 'right', font: 'var(--text-mono-sm)',
            fontWeight: 700, color: pkg.pct === 100 ? 'var(--mos-flag-done)' : 'var(--muted)',
          }}
        >
          {pkg.pct}%
        </span>
      </span>
    </button>
  );
}

function ProjectCard({ card, onJumpProject, onOpenPackage, onBadgeDrill }: {
  card: MosaicCard;
  onJumpProject: (projectId: string) => void;
  onOpenPackage: (projectId: string, wpId: string) => void;
  onBadgeDrill: (projectId: string, key: MosaicBadgeKey) => void;
}) {
  // One measurement per card: every row's track is the same width, so the first one
  // answers for all of them. Re-measured on resize — at a narrow viewport the column
  // stacks and the bars grow, and counts that did not fit before should come back.
  const trackRef = useRef<HTMLSpanElement>(null);
  const [trackW, setTrackW] = useState(0);
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackW(el.offsetWidth);
    const ro = new ResizeObserver(([e]) => setTrackW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const slot = SLOTS[card.slot % SLOTS.length];
  return (
    <div className="mos-card">
      <button
        type="button"
        className="mos-head"
        onClick={() => onJumpProject(card.projectId)}
        title={`Open ${card.projectName} in the Material List`}
      >
        <span className="mos-row-label" style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--title)' }}>
          {card.projectName}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, font: 'var(--text-mono-sm)', fontWeight: 700, color: card.pct === 100 ? 'var(--mos-flag-done)' : 'var(--ink)' }}>
          {/* The closing stage, which is the whole difference between the two scopes: we
              are done when it is up (🔩), or when it reaches the jobsite (📍). */}
          <span>{card.scope === 'supply' ? '📍' : '🔩'}</span>
          {card.closed}/{card.total} · {card.pct}%
        </span>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 4px 6px' }}>
        {card.packages.map((pkg, i) => (
          <PackageBar
            key={pkg.wpId}
            pkg={pkg}
            slot={slot}
            scope={card.scope}
            widest={card.widest}
            trackW={trackW}
            trackRef={i === 0 ? trackRef : undefined}
            openHint="Click to open this package — move items along without leaving the board"
            onOpen={() => onOpenPackage(card.projectId, pkg.wpId)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 10px 8px', borderTop: '1px solid var(--hairline)' }}>
        {card.badges.map(({ key, items }, i) => {
          const meta = MOSAIC_BADGE_META[key];
          return (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span style={{ color: 'var(--hairline)', margin: '0 4px' }}>|</span>}
              <button
                type="button"
                className="mos-badge"
                disabled={items.length === 0}
                title={listTip(items, meta.label)}
                aria-label={`${items.length} ${meta.label} — ${card.projectName}`}
                onClick={() => onBadgeDrill(card.projectId, key)}
              >
                <span>{meta.icon}</span>
                <span style={{ font: 'var(--text-mono-sm)', fontWeight: 700 }}>{items.length}</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function InstallMosaic({ cards, empty, onJumpProject, onOpenPackage, onBadgeDrill }: {
  cards: MosaicCard[];
  empty: string;
  onJumpProject: (projectId: string) => void;
  onOpenPackage: (projectId: string, wpId: string) => void;
  onBadgeDrill: (projectId: string, key: MosaicBadgeKey) => void;
}) {
  // Measured in real pixels, not `auto-fit`: `auto-fit` packs as many cards as fit at its
  // minimum width and knows nothing about a column CAP, so a wide panel put six or seven
  // thin cards on one row. Hooks go before the empty-list return, so they never change
  // order between renders.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapW(el.offsetWidth);
    const ro = new ResizeObserver(([e]) => setWrapW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const colsAt = (min: number) => Math.max(1, Math.floor((wrapW + GRID_GAP) / (min + GRID_GAP)));
  // Up to five, and only while cards stay above the legibility floor. Never more columns
  // than cards — four projects in a five-wide grid would leave a hole.
  const cols = wrapW === 0 ? 0 : Math.min(MAX_COLS, cards.length, colsAt(CARD_FLOOR));

  if (cards.length === 0) {
    return (
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--canvas)', padding: '22px 16px', textAlign: 'center', font: 'var(--text-body)', color: 'var(--muted)' }}>
        {empty}
      </div>
    );
  }
  return (
    // Ragged bottoms are fine — forcing equal heights would stretch a two-package card to
    // match an eight-package one and turn the size difference into whitespace.
    <div
      ref={wrapRef}
      style={{
        display: 'grid',
        gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : 'repeat(auto-fit, minmax(226px, 1fr))',
        gap: GRID_GAP, alignItems: 'start',
      }}
    >
      {cards.map((card) => (
        <ProjectCard
          key={card.projectId}
          card={card}
          onJumpProject={onJumpProject}
          onOpenPackage={onOpenPackage}
          onBadgeDrill={onBadgeDrill}
        />
      ))}
    </div>
  );
}
