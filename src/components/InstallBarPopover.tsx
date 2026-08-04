// InstallBarPopover.tsx — the install bar's click popover (lote 75). One per bar:
// the package's header, the PER-PROJECT colour swatches, "Open package", and the
// mark-installed section. Replaces InstallBarColorPopover (the legend's global
// swatch — the colour is per project now and the picker lives where the click is).
//
// Portaled to <body> — the sticky band the bars live in is its own stacking context
// (CLAUDE.md trap). `position: fixed` at the anchor rect captured on open: scrolling
// moves the bar but not the panel, so it closes instead of drifting. The conflict
// alarm (installing on material not on site) still owns red — this picker can never
// mute it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INSTALL_BAR_TONES } from './installBarTone';
import { localRect, localViewport } from './uiScale';

export function InstallBarPopover({ anchor, toneKey, header, installable, itemCount, onPickTone, onOpenPackage, onMarkInstalled, onClose }: {
  /** The bar button's rect at click time, already in local (un-zoomed) px — localRect. */
  anchor: ReturnType<typeof localRect>;
  toneKey: string;             // the current tone of THIS project
  header: { projectName: string; label: string; summary: string; stateWord: string; mixed: boolean };
  /** Items with material on site left to install — the mark-installed button's count. */
  installable: number;
  itemCount: number;
  onPickTone: (key: string) => void;
  onOpenPackage: () => void;
  onMarkInstalled: () => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 4, left: anchor.left });

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
    <div ref={popRef} role="dialog" aria-label={`${header.label} — install window options`} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: 260, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{header.projectName}</div>
        <div style={{ font: 'var(--text-body)', fontWeight: 700 }}>{header.label}</div>
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
        <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginLeft: 2 }}>This project only</span>
      </div>
      <button type="button" className="btn" onClick={onOpenPackage}>Open package</button>
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          className="btn"
          disabled={installable === 0}
          title={installable === 0 ? 'Nothing on site yet — receive material first' : undefined}
          onClick={onMarkInstalled}
        >
          Mark package installed ({installable} of {itemCount} items)
        </button>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
          Marks everything received so far, dated today. To mark individual items, use the Material List.
        </div>
      </div>
    </div>,
    document.body,
  );
}
