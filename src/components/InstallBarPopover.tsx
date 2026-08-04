// InstallBarPopover.tsx — the install bar's click popover (lote 75; grouped in lote
// 76). One per bar: the window's header, the PER-PROJECT colour swatches, and the
// member list — one row per package with a checkbox for the mark-installed write and
// a clickable name that opens the package. A lone package is a group of 1: same
// component, same code path.
//
// The colour is PER PROJECT on purpose — a per-package colour was explicitly rejected
// by the PM as visual noise. The conflict alarm (installing on material not on site)
// still owns red wherever it applies — this picker can never mute it.
//
// Portaled to <body> — the sticky band the bars live in is its own stacking context
// (CLAUDE.md trap). `position: fixed` at the anchor rect captured on open: scrolling
// moves the bar but not the panel, so it closes instead of drifting.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INSTALL_BAR_TONES } from './installBarTone';
import { localRect, localViewport } from './uiScale';
import { readinessMark, type PkgReadiness } from '../store/logic';

export interface InstallPopoverMember {
  wpId: string;
  label: string;
  readiness: PkgReadiness;
  /** Items with material on site left to install — 0 disables the row's checkbox. */
  installable: number;
  itemCount: number;
}

export function InstallBarPopover({ anchor, toneKey, header, members, onPickTone, onOpenPackage, onMarkInstalled, onClose }: {
  /** The bar button's rect at click time, already in local (un-zoomed) px — localRect. */
  anchor: ReturnType<typeof localRect>;
  toneKey: string;             // the current tone of THIS project
  header: { projectName: string; summary: string; stateWord: string; mixed: boolean };
  members: InstallPopoverMember[];
  onPickTone: (key: string) => void;
  onOpenPackage: (wpId: string) => void;
  onMarkInstalled: (wpIds: string[]) => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 4, left: anchor.left });
  // Checked by default: every member with something on site. A member with nothing
  // received can never be checked (its checkbox is disabled with the why).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.installable > 0).map((m) => m.wpId)),
  );
  const toggle = (wpId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(wpId)) next.delete(wpId); else next.add(wpId);
      return next;
    });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const close = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, { capture: true });
    };
  }, [onClose]);

  // Same flip every toolbar popover uses: once the panel has rendered, if it spills
  // past the viewport bottom it goes above the anchor — or clamps — instead of hiding
  // off-screen. The left edge clamps to the viewport too (a bar near the right edge).
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const h = pop.offsetHeight, w = pop.offsetWidth;
    const { vh, vw } = localViewport();
    let top = anchor.bottom + 4;
    if (top + h > vh - 8) {
      const above = anchor.top - h - 4;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    const left = Math.min(anchor.left, Math.max(8, vw - w - 8));
    setPos((p) => (p.top === top && p.left === left ? p : { top, left }));
  }, [anchor]);

  const current = INSTALL_BAR_TONES.find((t) => t.key === toneKey) ?? INSTALL_BAR_TONES[0];

  return createPortal(
    <div ref={popRef} role="dialog" aria-label="Install window options" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: 280, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{header.projectName}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
          {header.summary}{header.mixed ? ' · ⚠ items have different windows' : ''} · {header.stateWord}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {INSTALL_BAR_TONES.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              className="swatch-btn"
              title={t.label}
              aria-label={`Install bars: ${t.label}`}
              aria-pressed={on}
              onClick={() => onPickTone(t.key)}
              style={{
                width: 26, height: 26, borderRadius: 6, background: t.fill,
                borderWidth: 2, borderStyle: 'solid', borderColor: on ? t.ink : 'var(--hairline)',
                boxShadow: on ? `0 0 0 2px ${t.ink}` : undefined,
              }}
            />
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map((m) => {
          const mark = readinessMark(m.readiness, false);
          const canMark = m.installable > 0;
          return (
            <div key={m.wpId} style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-caption)' }}>
              <input
                type="checkbox"
                checked={selected.has(m.wpId)}
                disabled={!canMark}
                title={canMark ? undefined : 'Nothing on site yet — receive material first'}
                onChange={() => toggle(m.wpId)}
                aria-label={`Select ${m.label}`}
              />
              <button
                type="button"
                onClick={() => onOpenPackage(m.wpId)}
                title="Open the package"
                style={{ padding: 0, border: 'none', background: 'none', color: 'var(--link)', font: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                {m.label}
              </button>
              <span style={{ color: `var(${mark.token})`, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {mark.glyph} {mark.word} · {m.installable}/{m.itemCount}
              </span>
            </div>
          );
        })}
        <button type="button" className="btn" disabled={selected.size === 0} onClick={() => onMarkInstalled([...selected])}>
          Mark installed ({selected.size} package{selected.size === 1 ? '' : 's'})
        </button>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
          Marks everything received so far, dated today. To mark individual items, use the Material List.
        </div>
      </div>
    </div>,
    document.body,
  );
}
