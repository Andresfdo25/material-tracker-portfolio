// BreakdownSubmittalsModal.tsx — the submittal-cycle tracker for items that need more
// than product data. Product data keeps its 6-state dropdown; Samples, Shop drawings
// and a free-text "Other" are opt-in (Required) and, once required, must reach Approved
// or the item stays "Blocked by submittal". Opened from the row ⋮ menu, below Breakdown
// Delivery. Edits apply live (like the grid cells).
import { useState } from 'react';
import { useApp } from '../store/useApp';
import { fmtMDY, submittalBlockers, SUBMITTALS, SUB_STATUSES, SUB_STATUS_LABEL } from '../store/logic';
import type { MaterialItem, SubmittalCompStatus } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';

const STATUS_TONE: Record<SubmittalCompStatus, { bg: string; ink: string }> = {
  pending: { bg: 'var(--status-order-soon)', ink: 'var(--status-order-soon-ink)' },
  approved: { bg: 'var(--status-ordered)', ink: 'var(--status-ordered-ink)' },
  revise: { bg: 'var(--status-order-now)', ink: 'var(--status-order-now-ink)' },
};

function StatusPicker({ value, onChange }: { value: SubmittalCompStatus; onChange: (s: SubmittalCompStatus) => void }) {
  return (
    <div style={{ display: 'inline-flex', padding: 2, gap: 2, borderRadius: 'var(--radius-sm)', background: 'var(--surface-soft)', border: '1px solid var(--hairline)' }}>
      {SUB_STATUSES.map((s) => {
        const on = value === s;
        const tone = STATUS_TONE[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 4, padding: '5px 12px', whiteSpace: 'nowrap',
              font: 'var(--text-caption)', fontWeight: on ? 700 : 500,
              background: on ? tone.bg : 'transparent', color: on ? tone.ink : 'var(--muted)',
            }}
          >
            {s === 'revise' ? 'Revise' : SUB_STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

function CompRow({ title, hint, req, status, onToggle, onStatus, children, note, statusWhenOff }: {
  title: string; hint: string; req: boolean; status: SubmittalCompStatus;
  onToggle: (v: boolean) => void; onStatus: (s: SubmittalCompStatus) => void; children?: React.ReactNode;
  /** Line above the picker — the scheduled field-measure visit, when there is one. */
  note?: React.ReactNode;
  /** Show the status picker even with Required off. Requiring a component is about
   * blocking the ORDER; the field-measure status also answers "did we go?", and that
   * question has to stay answerable whether or not it blocks anything. */
  statusWhenOff?: boolean;
}) {
  const open = req || statusWhenOff;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: req ? 'var(--canvas)' : 'var(--surface-soft)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={req} onChange={(e) => onToggle(e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--brand-slate)' }} />
        <span style={{ font: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
        <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{hint}</span>
      </label>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 30 }}>
          {note}
          {req && children}
          <StatusPicker value={status} onChange={onStatus} />
        </div>
      )}
    </div>
  );
}

/** The scheduled visit, inside the Field measurements row — the date lives on the item
 * (`fieldDate`, set from the toolbar ◆) but the only thing that says it HAPPENED is this
 * row's status, so the two have to be readable together. */
function FieldVisitNote({ date, status }: { date: string; status: SubmittalCompStatus }) {
  return (
    <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span aria-hidden style={{ width: 9, height: 9, marginTop: 4, background: 'var(--brand-orange)', borderRadius: 2, transform: 'rotate(45deg)', display: 'inline-block', flexShrink: 0 }} />
      <span>
        Field measure visit scheduled <b style={{ color: 'var(--ink)' }}>{fmtMDY(date)}</b> —{' '}
        {status === 'approved'
          ? <>measurements confirmed taken, so its ◆ is off the Overview timeline. Back to Pending puts it there.</>
          : <>its ◆ stays on the Overview timeline (pinned to today once that date passes) until this reads <b style={{ color: 'var(--ink)' }}>Approved</b>.</>}
      </span>
    </div>
  );
}

export function BreakdownSubmittalsModal({ item, onClose }: { item: MaterialItem; onClose: () => void }) {
  const { actions } = useApp();
  const set = (patch: Partial<MaterialItem>) => actions.editItem(item.id, patch);
  const blockers = submittalBlockers(item);
  const cleared = blockers.length === 0;

  return (
    <Modal title="🧾 Breakdown Submittals" onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>{item.description || 'Item'}</strong> — track every submittal component. The item stays
          <strong> Blocked by submittal</strong> until product data and every required component are Approved.
        </div>

        {/* Product data — the always-present component (existing 6-state field) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ font: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>Product data <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 400 }}>· always required</span></span>
          <select
            value={item.submittal}
            onChange={(e) => set({ submittal: e.target.value })}
            style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', cursor: 'pointer' }}
          >
            {SUBMITTALS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <CompRow
          title="Samples" hint="physical sample approval"
          req={item.sampleReq} status={item.sampleStatus}
          onToggle={(v) => set({ sampleReq: v })} onStatus={(s) => set({ sampleStatus: s })}
        />
        <CompRow
          title="Shop drawings" hint="fabrication drawings approval"
          req={item.shopReq} status={item.shopStatus}
          onToggle={(v) => set({ shopReq: v })} onStatus={(s) => set({ shopStatus: s })}
        />
        {/* The only row with a date of its own: `fieldDate` is set from the toolbar ◆ and
            this status is what confirms the visit happened. So when a visit is scheduled
            the picker shows even with Required off — otherwise the ◆ would be anchored to
            the timeline with its only release hidden behind a checkbox that means
            something else entirely. */}
        <CompRow
          title="Field measurements" hint="site verification before fabrication"
          req={item.fieldReq} status={item.fieldStatus}
          onToggle={(v) => set({ fieldReq: v })} onStatus={(s) => set({ fieldStatus: s })}
          statusWhenOff={!!item.fieldDate}
          note={item.fieldDate ? <FieldVisitNote date={item.fieldDate} status={item.fieldStatus} /> : undefined}
        />
        <CompRow
          title="Other" hint="anything else blocking the order"
          req={item.otherReq} status={item.otherStatus}
          onToggle={(v) => set({ otherReq: v })} onStatus={(s) => set({ otherStatus: s })}
        >
          <input
            type="text"
            value={item.otherNote}
            onChange={(e) => set({ otherNote: e.target.value })}
            placeholder="What else is blocking this order? (e.g. LEED docs, mock-up sign-off…)"
            style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', outline: 'none' }}
          />
        </CompRow>

        {/* Live summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: cleared ? 'color-mix(in srgb, var(--success-border) 16%, white)' : 'var(--status-order-now)', border: `1px solid ${cleared ? 'var(--success-border)' : 'var(--status-order-now-ink)'}` }}>
          <span style={{ fontSize: 18 }}>{cleared ? '✅' : '⛔'}</span>
          <span style={{ font: 'var(--text-body)', fontWeight: 600, color: cleared ? 'var(--success)' : 'var(--status-order-now-ink)' }}>
            {cleared ? 'Submittal cycle complete — ready to order.' : `Blocked by submittal — ${blockers.join(', ')}`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Bulk version — the same cycle controls applied to every selected item at once.
 * Each toggle/status writes to the whole selection immediately (like editing a cell). */
export function BulkSubmittalsModal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const { actions } = useApp();
  const [f, setF] = useState({
    submittal: '', sampleReq: false, sampleStatus: 'pending' as SubmittalCompStatus, shopReq: false, shopStatus: 'pending' as SubmittalCompStatus,
    fieldReq: false, fieldStatus: 'pending' as SubmittalCompStatus, otherReq: false, otherStatus: 'pending' as SubmittalCompStatus, otherNote: '',
  });
  const upd = (patch: Partial<MaterialItem>) => { setF((s) => ({ ...s, ...patch })); actions.bulkEditItems(ids, patch); };

  return (
    <Modal title="🧾 Breakdown Submittals — bulk" onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--muted)' }}>
          Applies to <strong style={{ color: 'var(--ink)' }}>{ids.length} selected item{ids.length === 1 ? '' : 's'}</strong>. Each change writes to the whole selection right away.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ font: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>Product data</span>
          <select
            value={f.submittal}
            onChange={(e) => { const v = e.target.value; setF((s) => ({ ...s, submittal: v })); if (v) actions.bulkEditItems(ids, { submittal: v }); }}
            style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', cursor: 'pointer' }}
          >
            <option value="">— no change —</option>
            {SUBMITTALS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <CompRow title="Samples" hint="physical sample approval" req={f.sampleReq} status={f.sampleStatus} onToggle={(v) => upd({ sampleReq: v })} onStatus={(s) => upd({ sampleStatus: s })} />
        <CompRow title="Shop drawings" hint="fabrication drawings approval" req={f.shopReq} status={f.shopStatus} onToggle={(v) => upd({ shopReq: v })} onStatus={(s) => upd({ shopStatus: s })} />
        <CompRow title="Field measurements" hint="site verification before fabrication" req={f.fieldReq} status={f.fieldStatus} onToggle={(v) => upd({ fieldReq: v })} onStatus={(s) => upd({ fieldStatus: s })} />
        <CompRow title="Other" hint="anything else blocking the order" req={f.otherReq} status={f.otherStatus} onToggle={(v) => upd({ otherReq: v })} onStatus={(s) => upd({ otherStatus: s })}>
          <input
            type="text"
            value={f.otherNote}
            onChange={(e) => upd({ otherNote: e.target.value })}
            placeholder="What else is blocking these orders?"
            style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', outline: 'none' }}
          />
        </CompRow>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
