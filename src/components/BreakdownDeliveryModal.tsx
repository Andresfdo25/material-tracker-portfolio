// BreakdownDeliveryModal.tsx — the item's delivery cockpit, opened from the stage icon
// in the "Delivery / Installation" column. It has two shapes:
//
// SUPPLY AND INSTALL (we install it)
//   1 · Delivery      — partial deliveries against the ordered QTY. Each entry logs
//      qty + a note; while the backorder is open the item shows PARTIALLY DELIVERED and
//      the Received checkbox is locked; the entry that closes it flips to RECEIVED.
//   2 · Installation  — where the material physically is: warehouse → jobsite →
//      installed. The stage is derived from `delivered` / `siteDate` / `installed`
//      (see itemStage), so there's no enum to fall out of sync with the checkboxes.
//
// SUPPLY ONLY (somebody else installs it)
//   Supply-only material usually ships straight from the vendor to the jobsite, so the
//   warehouse — and its received date — is the exception, not the main path:
//   1 · Delivery to site                     — the normal flow, qty + date per entry.
//   2 · Delivery to warehouse or from stock  — the detour: how much arrived at the
//      warehouse and when, how much was released to the site, and how much came out of
//      our own stock. Once the log records movements it OWNS the stage (see
//      siteDateFromLog in AppContext), so the stage buttons step aside.
import { Fragment, useState, type CSSProperties } from 'react';
import { useApp } from '../store/useApp';
import {
  backorderQty, closesAtSite, daysWaiting, DELIVERY_KIND_META, deliveryTotals, fmtMDY,
  installCap, installDateOf, installUrgency, isOfci, itemStage, logDrivesStage, pendingInstallQty,
  STAGE_META, today, totalQty,
} from '../store/logic';
import type { DeliveryKind, ItemStage, MaterialItem } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { TextInput } from './ds/TextInput';
import { Banner } from './ds/Banner';
import { Select } from './ds/Select';
import { InstallWindowFields } from './InstallWindowFields';

const STAGE_ORDER: ItemStage[] = ['pending', 'warehouse', 'on-site', 'installed'];
/** Movements offered in the warehouse section, in the order they happen. */
const DETOUR_KINDS: DeliveryKind[] = ['wh-in', 'wh-out', 'stock'];

export function BreakdownDeliveryModal({ item, onClose }: { item: MaterialItem; onClose: () => void }) {
  const { actions, thresholdsFor, db } = useApp();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<DeliveryKind>('wh-in');
  const [dQty, setDQty] = useState('');
  const [dNote, setDNote] = useState('');
  const [dDate, setDDate] = useState(today());
  // Installation entries (lote 44) — same three fields as a delivery, minus the movement.
  const [iQty, setIQty] = useState('');
  const [iNote, setINote] = useState('');
  const [iDate, setIDate] = useState(today());
  // The warehouse detour is the exception, not the flow — it stays folded away until the
  // PM says they need it (and it can't be opened once everything is already on site).
  const [showDetour, setShowDetour] = useState(false);

  const total = totalQty(item);
  const back = backorderQty(item);
  // An item ticked Received straight from the grid never logs partial entries, so the
  // raw receivedQty stays 0 — showing "Backorder 22" on fully-received material would
  // be a lie. Once delivered, the delivery section reads as closed out.
  const receivedShown = item.delivered ? (total ?? item.receivedQty) : item.receivedQty;
  const backShown = item.delivered ? 0 : back;

  /* ---- scope + stage ---- */
  const stage = itemStage(item);
  const ofci = isOfci(item.po);
  const pkg = db.packages.find((p) => p.id === item.wpId);
  // Supply only: we don't install, so the cycle ends one stage earlier and 🔩 is off
  // the menu entirely — see closesAtSite (package flag wins, project is the default).
  const supplyOnly = closesAtSite(pkg, db.projects.find((p) => p.id === pkg?.projectId));
  // OFCI has one axis and only one: installed or not (SPEC-delivery-watch §8). 🏭 and 📍
  // are unreachable there — `delivered` is forced false on owner-furnished material — so
  // offering them was offering two buttons that did nothing visible. In a supply-only
  // package there is no axis at all: the owner buys it and somebody else installs it.
  const locked = back != null && back > 0 && item.receivedQty > 0;
  // A partially delivered item lands on the SAME single axis as an OFCI row (batch 43):
  // the install is open to it — the vendor sent half the order, the PM puts up that half
  // and reschedules the rest — but the receipt is not, so `delivered` stays false and
  // 🏭 / 📍, which both read it, are unreachable. 🚚 therefore reads "not installed"
  // here as well, or 🔩 would be a one-way door.
  const oneAxis = ofci || (locked && !supplyOnly);
  // Supply only + an open backorder = no axis at all: closing there IS the delivery, and
  // half of it hasn't landed. Those buttons stay locked until section 1 closes.
  const stagesLocked = locked && supplyOnly;
  /* ---- install quantities (lote 44) ----
   * 🔩 has always meant "all of it". It steps aside whenever that would be a LIE — a
   * backorder is open, so part of the QTY never even arrived — or would be OVERRIDDEN —
   * the installation log already owns the number. In both cases the quantity form below
   * is the way in, and 🔩 comes back on its own once neither holds. */
  const instCap = installCap(item);
  const instPending = pendingInstallQty(item);
  const installLogOwns = item.installations.length > 0;
  const qtyDrivesInstall = !supplyOnly && !ofci && (locked || installLogOwns);
  // Nothing here yet and no history = nothing to say; the section appears with the material.
  const showInstallQty = !supplyOnly && !ofci && instCap != null && (instCap > 0 || installLogOwns);
  const stages = (ofci
    ? (supplyOnly ? [] : (['pending', 'installed'] as ItemStage[]))
    : supplyOnly ? STAGE_ORDER.filter((s) => s !== 'installed')
      : locked ? (['pending', 'installed'] as ItemStage[])
        : STAGE_ORDER
  ).filter((s) => !(qtyDrivesInstall && (s === 'installed' || (oneAxis && s === 'pending'))));
  const closed = supplyOnly ? stage === 'on-site' : stage === 'installed';
  const cfg = thresholdsFor(pkg?.projectId ?? '');
  const urgency = installUrgency(item, cfg);
  const waiting = daysWaiting(item);

  const totals = deliveryTotals(item.deliveries);
  const logOwnsStage = logDrivesStage(item.deliveries);
  const siteLog = item.deliveries.map((d, i) => ({ d, i })).filter(({ d }) => !d.kind || d.kind === 'site');
  const detourLog = item.deliveries.map((d, i) => ({ d, i })).filter(({ d }) => d.kind && d.kind !== 'site');
  // Without movements in the log the stage fields are the truth: an item marked on site
  // from the grid or the header popover has ALL of it there — same reasoning as
  // receivedShown above, which reads a ticked Received checkbox as the full QTY.
  const onSiteShown = logOwnsStage ? totals.onSite : (stage === 'on-site' || stage === 'installed' ? (total ?? 0) : 0);
  const onSitePending = total == null ? null : Math.max(0, total - onSiteShown);
  // Openable only while something is still short of the jobsite; already-logged movements
  // keep the section visible so the record never disappears.
  const canOpenDetour = total != null && (onSitePending ?? 0) > 0;
  const detourOpen = detourLog.length > 0 || (showDetour && canOpenDetour);

  const add = (q: string, n: string, dt: string, k?: DeliveryKind, cap?: number | null) => {
    const entered = Number(q);
    if (isNaN(entered) || entered <= 0) return;
    actions.addDelivery(item.id, cap != null ? Math.min(entered, cap) : entered, n.trim(), k, dt);
  };
  const addToSite = () => {
    add(qty, note, date, supplyOnly ? 'site' : undefined, back);
    setQty(''); setNote('');
  };
  const addDetour = () => {
    // A warehouse release can only move what's actually in the warehouse.
    add(dQty, dNote, dDate, kind, kind === 'wh-out' ? totals.warehouse : back);
    setDQty(''); setDNote('');
  };
  const addInstallEntry = () => {
    const entered = Number(iQty);
    if (isNaN(entered) || entered <= 0) return;
    // `addInstallTo` clamps to what arrived as well — this is only so the number the PM
    // sees registered matches the number the form said was available.
    actions.addInstall(item.id, instPending == null ? entered : Math.min(entered, instPending), iNote.trim(), iDate);
    setIQty(''); setINote('');
  };
  const removeInstallEntry = (i: number) => {
    const consequence = item.installed
      ? ' This item is currently marked Installed — dropping below the full QTY reopens it.'
      : '';
    if (window.confirm(`Undo this installation entry?${consequence}`)) actions.removeInstall(item.id, i);
  };
  // Undoing an entry now goes through the same cascade a manual un-receive does (lote 40):
  // if it drops the item back under the ordered QTY, on-site / installed reset with it, not
  // just the quantity. That is a bigger effect than "delete a row", so it gets a confirm —
  // worded to match what will actually happen, not a generic "are you sure?".
  const removeEntry = (i: number) => {
    // Only a FULLY received item un-installs when its quantity drops: the revert rides on
    // the receipt being withdrawn, and an item installed while a backorder was still open
    // never had one (batch 43), so nothing downstream of it moves.
    const consequence = stage === 'installed' && item.delivered
      ? ' This item is currently marked Installed — if the remaining quantity falls short, it will also revert to not installed.'
      : stage === 'on-site'
        ? ' This item is currently marked On site — if the remaining quantity falls short, that will be undone too.'
        : '';
    if (window.confirm(`Undo this delivery entry?${consequence}`)) actions.removeDelivery(item.id, i);
  };

  /* The stage buttons no longer build their own patch: `setItemStage` funnels every
   * surface through `stagePatch` (OFCI, the date stamps and the delivery-log arbitration
   * decided in one place — SPEC-hardening §8). A blank date means "keep the stamp it
   * already has, or today", which is what this modal always did by hand. */
  const setStage = (s: ItemStage) => actions.setItemStage([item.id], s);

  const urgencyNote = () => {
    // "Lifecycle closed" would overstate it while material is still owed: what is closed
    // is the install of the part that arrived (batch 43).
    if (stage === 'installed') {
      return locked
        ? { tone: 'good', text: `🔩 Installed ${item.installedDate ? fmtMDY(item.installedDate) : ''} — what arrived is up; ${back} still owed.` }
        : { tone: 'good', text: `🔩 Installed ${item.installedDate ? fmtMDY(item.installedDate) : ''} — lifecycle closed.` };
    }
    if (supplyOnly && stage === 'on-site') return { tone: 'site', text: `📍 On site ${item.siteDate ? fmtMDY(item.siteDate) : ''} — supply only, lifecycle closed.` };
    if (stage === 'pending') return null;
    // The date urgency was measured against (§7.5): the planned install end when the item
    // carries a window, the On-Site Req. fallback otherwise — print exactly that one.
    const iDate = installDateOf(item);
    const planned = !!item.installEnd;
    if (urgency === 'overdue') return { tone: 'bad', text: planned ? `⚠ Install by ${fmtMDY(iDate)} — it should be installed by now.` : `⚠ On-Site Req. date was ${fmtMDY(iDate)} — it should be ${supplyOnly ? 'on site' : 'installed'} by now.` };
    if (urgency === 'unscheduled') return { tone: 'warn', text: '❔ No On-Site Req. date — this item has no schedule. Set one so it shows on the timeline.' };
    if (urgency === 'due-soon') return { tone: 'warn', text: planned ? `🟠 Install by ${fmtMDY(iDate)} — release it from the warehouse now.` : `🟠 Needed on site ${fmtMDY(iDate)} — release it from the warehouse now.` };
    return { tone: 'plain', text: planned ? `Install by ${fmtMDY(iDate)}.` : `Needed on site ${fmtMDY(iDate)}.` };
  };
  const un = urgencyNote();
  const urgencyInk = un?.tone === 'bad' ? 'var(--status-order-now-ink)' : un?.tone === 'warn' ? 'var(--status-order-soon-ink)'
    : un?.tone === 'good' ? 'var(--status-installed-ink)' : un?.tone === 'site' ? 'var(--status-on-site-ink)' : 'var(--muted)';

  const dateRow = (label: string, value: string, onChange: (v: string) => void) => (
    <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--text-caption)', color: 'var(--body)' }}>
      <span style={{ width: 110, flexShrink: 0 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 34, padding: '0 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)' }}
      />
      <button type="button" title="Set to today" onClick={() => onChange(today())} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, padding: 2 }}>🕒</button>
    </label>
  );

  const sectionTitle = (text: React.ReactNode) => (
    <div style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--title)', letterSpacing: 0.3 }}>{text}</div>
  );

  /* The PLAN half of the cycle: when the crew is scheduled to put it up. It never moves
   * the RECORD (installed / installedDate / installations), and 🔩 never stamps these
   * dates — applyItemPatch has no cascade between them. Supply-only packages have no
   * installation phase at all (§4.5), so the row simply isn't rendered there. */
  const scheduleRow = !supplyOnly && (
    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sectionTitle('INSTALLATION SCHEDULE')}
      <InstallWindowFields
        start={item.installStart ?? ''}
        end={item.installEnd ?? ''}
        onChange={(v) => actions.editItem(item.id, { installStart: v.start, installEnd: v.end })}
      />
    </div>
  );

  /* The two halves of the cycle sit side by side and read left to right — delivery gives
   * way to installation — with the stage rail spanning both underneath, because the stage
   * is the one thing that belongs to neither half alone. Two self-contained cards rather
   * than one grid with a divider: they stack cleanly on a narrow window, which inline
   * styles can't do with a media query. */
  const panelRow: CSSProperties = { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' };
  const panel: CSSProperties = {
    flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12,
    padding: 16, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--canvas)',
  };
  /** The hand-off marker on the second panel's title — it is step 2 of one flow, not a
   * second unrelated form. */
  const handOff = <span style={{ color: 'var(--muted)', fontWeight: 400 }}>→ </span>;

  /** Shared qty + date + note entry form. */
  const entryForm = (
    q: string, setQ: (v: string) => void,
    n: string, setN: (v: string) => void,
    dt: string, setDt: (v: string) => void,
    onAdd: () => void, cap: number | null, label: string, extra?: React.ReactNode,
    capLabel = 'Use the full amount left',
  ) => {
    const entered = Number(q);
    const valid = !isNaN(entered) && entered > 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {extra}
        {/* No need to do the subtraction by hand — this fills in exactly what's still
            missing, so "it all showed up" is one click plus Register. A real button, not
            a text link: it's the fast path for the common case (the whole backorder
            arrived at once) and it earns the visual weight. */}
        {cap != null && cap > 0 && (
          <button
            type="button"
            onClick={() => setQ(String(cap))}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              border: '1px solid var(--status-installed-ink)', borderRadius: 'var(--radius-md)',
              background: q === String(cap) ? 'var(--status-installed)' : 'var(--canvas)',
              color: 'var(--status-installed-ink)', cursor: 'pointer',
              font: 'var(--text-caption)', fontWeight: 700, padding: '7px 12px',
            }}
          >
            ✅ {capLabel} — {cap}
          </button>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)', flex: '1 1 120px' }}>
            Quantity
            <TextInput type="number" min={1} placeholder={cap != null ? `up to ${cap}` : 'qty'} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)', flex: '1 1 150px' }}>
            Date
            <input
              type="date"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)' }}
            />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          Notes (invoice #, reference)
          <TextInput placeholder="e.g. INV-4482" value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }} />
        </label>
        {valid && cap != null && entered > cap && (
          <div style={{ font: 'var(--text-caption)', color: 'var(--status-order-soon-ink)' }}>
            Entry exceeds what's left ({cap}) — it will be recorded as {cap}.
          </div>
        )}
        <div>
          <Button variant="primary" size="sm" onClick={onAdd} disabled={!valid}>{label}</Button>
        </div>
      </div>
    );
  };

  const log = (entries: { d: MaterialItem['deliveries'][number]; i: number }[], title: string) => entries.length > 0 && (
    <div>
      <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{title}</div>
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {entries.map(({ d, i }, row) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: row < entries.length - 1 ? '1px solid var(--hairline)' : 'none', font: 'var(--text-body)' }}>
            <span style={{ font: 'var(--text-mono)', fontWeight: 600, width: 56 }}>
              {d.kind === 'wh-out' ? '→' : '+'}{d.qty}
            </span>
            {d.kind && (
              <span title={DELIVERY_KIND_META[d.kind].label} style={{ fontSize: 14, cursor: 'help' }}>{DELIVERY_KIND_META[d.kind].icon}</span>
            )}
            <span style={{ font: 'var(--text-mono-sm)', color: 'var(--muted)', width: 92 }}>{fmtMDY(d.date)}</span>
            <span style={{ flex: 1, color: 'var(--body)' }}>{d.note || <span style={{ color: 'var(--muted)' }}>—</span>}</span>
            <button
              type="button"
              title="Undo this entry — reverts the quantities it added"
              aria-label="Remove delivery entry"
              onClick={() => removeEntry(i)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
                background: 'var(--canvas)', cursor: 'pointer', color: 'var(--status-order-now-ink)', font: 'var(--text-caption)', fontWeight: 600, padding: '4px 8px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--status-order-now) 25%, var(--canvas))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--canvas)'; }}
            >
              ✕ Undo
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* The installation log. Its own renderer rather than a parameter on `log()` above: that
   * one is about MOVEMENTS (the ± sign, the kind icon), and an installation has neither —
   * it is a quantity and a day. Sharing it would have meant three conditionals inside. */
  const installLog = item.installations.length > 0 && (
    <div>
      <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Installation log</div>
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {item.installations.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < item.installations.length - 1 ? '1px solid var(--hairline)' : 'none', font: 'var(--text-body)' }}>
            <span style={{ font: 'var(--text-mono)', fontWeight: 600, width: 56, color: 'var(--status-installed-ink)' }}>🔩{e.qty}</span>
            <span style={{ font: 'var(--text-mono-sm)', color: 'var(--muted)', width: 92 }}>{fmtMDY(e.date)}</span>
            <span style={{ flex: 1, color: 'var(--body)' }}>{e.note || <span style={{ color: 'var(--muted)' }}>—</span>}</span>
            <button
              type="button"
              title="Undo this entry — takes its quantity back off the wall"
              aria-label="Remove installation entry"
              onClick={() => removeInstallEntry(i)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
                background: 'var(--canvas)', cursor: 'pointer', color: 'var(--status-order-now-ink)', font: 'var(--text-caption)', fontWeight: 600, padding: '4px 8px',
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = 'color-mix(in srgb, var(--status-order-now) 25%, var(--canvas))'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'var(--canvas)'; }}
            >
              ✕ Undo
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // Once the log records movements it owns the stage and `stagePatch` refuses a manual
  // write, so the buttons are replaced by the reason rather than left there doing
  // nothing. The guard lives here, not in the two branches below: a package flipped from
  // supply-only to supply-and-install AFTER its movements were logged lands in the
  // install branch with a log that drives the stage, and that used to show live buttons.
  const stageButtons = logOwnsStage ? (
    <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
      The stage now follows the log above — {STAGE_META[stage].icon} <strong>{STAGE_META[stage].label}</strong>. Remove the entries to set it by hand again.
    </div>
  ) : stages.length === 0 ? (
    // Every stage this row could be in is decided by quantities now — 🔩 would either be
    // a lie (backorder open) or be overridden by the installation log.
    <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
      The install follows the quantities above — {item.installedQty} of {instCap ?? 0} here are up.
      {installLogOwns ? ' Undo the entries to set it by hand again.' : ''}
    </div>
  ) : (
    // A rail, not a row of equal chips: the four stages are a ONE-WAY LIFECYCLE and the
    // modal now reads left to right, so the control that moves the item has to read the
    // same way. The chevrons carry the direction; the stages already reached are tinted
    // so "where is it" is answerable without reading a single label.
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 4 }}>
      {stages.map((s, i) => {
        const on = stage === s;
        // On a one-axis row the pair is "not installed" ↔ "installed", so 🚚 reads as the
        // way back out of 🔩 rather than as "not received" — which is meaningless there.
        const meta = oneAxis && s === 'pending' ? { icon: STAGE_META.pending.icon, label: 'Not installed' } : STAGE_META[s];
        const off = stagesLocked && s !== 'pending';
        // Passed = an earlier stage than the one it's in. Only meaningful on the full
        // four-step rail; a two-button one-axis row has no "behind it".
        const passed = !oneAxis && !on && STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage);
        return (
          <Fragment key={s}>
            {i > 0 && (
              <span aria-hidden style={{ alignSelf: 'center', color: 'var(--muted)', font: 'var(--text-body)', flexShrink: 0 }}>›</span>
            )}
            <button
              type="button"
              onClick={() => setStage(s)}
              disabled={off}
              aria-current={on ? 'step' : undefined}
              title={off ? 'Locked — an open backorder must be closed first (section 1)' : `Mark as ${meta.label}`}
              style={{
                flex: '1 1 108px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.5 : 1,
                padding: '9px 10px', borderRadius: 'var(--radius-md)', whiteSpace: 'nowrap',
                font: 'var(--text-caption)', fontWeight: on ? 700 : 500,
                borderWidth: 2, borderStyle: 'solid',
                borderColor: on ? 'var(--status-installed-ink)' : passed ? 'var(--status-installed)' : 'var(--hairline)',
                background: on ? 'var(--status-installed)' : 'var(--canvas)',
                color: on ? 'var(--status-installed-ink)' : passed ? 'var(--status-installed-ink)' : 'var(--body)',
              }}
            >
              {meta.icon} {meta.label}
            </button>
          </Fragment>
        );
      })}
    </div>
  );

  const noQty = (
    <Banner tone="warning" icon="⚠">
      This item's QTY isn't a number, so quantities can't be tracked. Set a numeric QTY first.
    </Banner>
  );

  /* ---- the third shape: OFCI (SPEC-delivery-watch §8) ----
   * Owner Furnished, Contractor Installed. There is no PO to chase, no delivery to
   * receive against and no submittal to clear, so section 1 would be a form that writes
   * a receipt for material that never passed through our hands. What's left is the one
   * question the PM does answer about it: is it in the wall yet? */
  const ofciBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        {sectionTitle(supplyOnly ? 'NOTHING TO TRACK' : 'INSTALLATION')}
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }}>
          🏛 Owner furnished, contractor installed — it never enters our procurement, so there's no
          PO, no receiving and no submittal on this item.
        </div>
      </div>
      {supplyOnly ? (
        <Banner tone="info" icon="🏛">
          This package is <strong>supply only</strong> and this item is <strong>OFCI</strong>: the owner
          buys it and somebody else installs it. Nothing here is ours to track — the row is
          read-only on purpose. Clear the OFCI from PO# if that was a mistake.
        </Banner>
      ) : (
        <>
          {stageButtons}
          {stage === 'installed' && dateRow('Installed', item.installedDate, (v) => actions.editItem(item.id, { installedDate: v }))}
          {/* The On-Site Req. date stays alive on an OFCI row precisely because it is the
              install date — the one thing the PM can still plan here — so it keeps its
              urgency colour instead of the muted note the main shape would give it. */}
          <div
            style={{
              font: 'var(--text-caption)', fontWeight: 600,
              color: stage === 'installed' ? 'var(--status-installed-ink)'
                : urgency === 'overdue' ? 'var(--status-order-now-ink)'
                  : urgency === 'due-soon' ? 'var(--status-order-soon-ink)' : 'var(--muted)',
            }}
          >
            {stage === 'installed'
              ? `🔩 Installed ${item.installedDate ? fmtMDY(item.installedDate) : ''} — lifecycle closed.`
              : urgency === 'unscheduled'
                ? '❔ No On-Site Req. date — nothing says when this has to be in the wall.'
                : urgency === 'overdue'
                  ? `⚠ ${item.installEnd ? `Install by ${fmtMDY(item.installEnd)}` : `On-Site Req. date was ${fmtMDY(item.onsite)}`} — it should be installed by now.`
                  : `${urgency === 'due-soon' ? '🟠 ' : ''}${item.installEnd ? `Install by ${fmtMDY(item.installEnd)}` : `Needed on site ${fmtMDY(item.onsite)}`}.`}
          </div>
          {/* OFCI is never supply-only in practice, but `scheduleRow` still gates on it —
              we install owner-furnished material, so the plan belongs here too. */}
          {scheduleRow}
        </>
      )}
      {/* An item marked OFCI after entries were already logged: the log would own the
          stage and refuse every write, so the way out is named instead of left hidden. */}
      {item.deliveries.length > 0 && (
        <Banner tone="warning" icon="⚠">
          This item still carries {item.deliveries.length} delivery {item.deliveries.length === 1 ? 'entry' : 'entries'} from
          before it was marked OFCI, and the log owns the stage while they're there. Use <strong>↺ Start over</strong> above to clear them.
        </Banner>
      )}
    </div>
  );

  return (
    // OFCI keeps the narrow modal: it has one axis and one question, so two columns would
    // be a column of air. Everything else reads across.
    <Modal title={ofci ? 'Installation · OFCI' : supplyOnly ? 'Delivery' : 'Delivery & Installation'} onClose={onClose} width={ofci ? 560 : 880}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ font: 'var(--text-body)', color: 'var(--body)' }}>
            <strong>{item.description || '(no description)'}</strong>
            <span style={{ color: 'var(--muted)' }}> · {item.qty || '—'} {item.um}</span>
          </div>
          {/* The escape hatch for "I entered this wrong from the start" — wipes every
              entry in one go instead of ✕-ing them one at a time, and goes through the
              same cascade as removing them all (un-installs / un-ships if the log was
              the only thing holding that up). Only shown once there's something to undo. */}
          {item.deliveries.length > 0 && (
            <button
              type="button"
              title="Clear every entry in this item's delivery log and go back to Not received"
              onClick={() => {
                if (window.confirm(`Clear all ${item.deliveries.length} entr${item.deliveries.length === 1 ? 'y' : 'ies'} in this item's delivery log and start over from "Not received"?`)) {
                  actions.clearDeliveries(item.id);
                }
              }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', font: 'var(--text-caption)', fontWeight: 600, padding: 0, whiteSpace: 'nowrap' }}
            >
              ↺ Start over
            </button>
          )}
        </div>

        {ofci ? ofciBody : supplyOnly ? (
          <>
            <div style={panelRow}>
            {/* ------------------------------------------- 1 · delivery to site */}
            <div style={panel}>
              <div>
                {sectionTitle('1 · DELIVERY TO SITE')}
                <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }}>
                  The normal path: the vendor ships straight to the jobsite. Getting the whole QTY there closes the item — no warehouse, no received date.
                </div>
              </div>
              {total == null ? noQty : (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Stat label="Total QTY" value={total} />
                    <Stat label="On site" value={onSiteShown} tone={onSiteShown > 0 ? 'good' : undefined} />
                    <Stat label="Pending" value={onSitePending ?? 0} tone={onSitePending === 0 ? 'good' : 'warn'} />
                  </div>
                  {onSitePending === 0 ? (
                    <Banner tone="success" icon="📍">All {total} on site — supply only, so the item is <strong>closed out</strong>.</Banner>
                  ) : (
                    entryForm(qty, setQty, note, setNote, date, setDate, addToSite, back, '➕ Register delivery to site')
                  )}
                  {log(siteLog, 'Deliveries to site')}
                </>
              )}
            </div>

            {/* ------------------- 2 · warehouse detour / from stock (on demand) */}
            <div style={panel}>
              {!detourOpen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canOpenDetour}
                    title={canOpenDetour
                      ? 'Register material that went through the warehouse, or came out of our own stock'
                      : 'Nothing left to move — the whole QTY is already on site'}
                    onClick={() => setShowDetour(true)}
                  >
                    🏭 Warehouse or from stock…
                  </Button>
                  <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', flex: '1 1 220px' }}>
                    {canOpenDetour
                      ? 'Only if this one took the detour — it normally ships straight to the jobsite.'
                      : 'Everything is on site, so there is nothing left to route through the warehouse.'}
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    {sectionTitle(<>{handOff}2 · WAREHOUSE OR FROM STOCK</>)}
                    <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }}>
                      How much reached the warehouse, how much was released to the site, and how much came out of our own stock.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Stat label="In warehouse" value={totals.warehouse} tone={totals.warehouse > 0 ? 'warn' : undefined} />
                    <Stat label="Released" value={item.deliveries.filter((d) => d.kind === 'wh-out').reduce((s, d) => s + d.qty, 0)} />
                    <Stat label="From stock" value={totals.stock} />
                  </div>
                  {canOpenDetour ? entryForm(
                    dQty, setDQty, dNote, setDNote, dDate, setDDate, addDetour,
                    kind === 'wh-out' ? totals.warehouse : back,
                    '➕ Register movement',
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
                      Movement
                      <Select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as DeliveryKind)}
                        options={DETOUR_KINDS.map((k) => ({ value: k, label: `${DELIVERY_KIND_META[k].icon} ${DELIVERY_KIND_META[k].label}` }))}
                      />
                    </label>,
                  ) : (
                    <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
                      The whole QTY is on site — nothing left to move. Remove an entry above to reopen this.
                    </div>
                  )}
                  {log(detourLog, 'Warehouse movements')}
                </>
              )}
            </div>
            </div>

            {/* Stage buttons stay available until the log takes over the stage. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
              {sectionTitle('WHERE IS IT RIGHT NOW?')}
              {!logOwnsStage && <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>Or mark the whole item at once:</div>}
              {stageButtons}
              {item.siteDate !== '' && dateRow('On site', item.siteDate, (v) => actions.editItem(item.id, { siteDate: v }))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, font: 'var(--text-caption)' }}>
                {un && <div style={{ color: urgencyInk, fontWeight: 600 }}>{un.text}</div>}
                {stage !== 'pending' && !closed && waiting != null && (
                  <div style={{ color: 'var(--muted)' }}>{waiting} day{waiting === 1 ? '' : 's'} since received · still short of the jobsite</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* The two halves side by side: what arrived → what went up. */}
            <div style={panelRow}>
              {/* -------------------------------------------------- 1 · delivery */}
              <div style={panel}>
                <div>
                  {sectionTitle('1 · DELIVERY')}
                  <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }}>How much of the order has actually landed.</div>
                </div>
                {total == null ? noQty : (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Stat label="Total QTY" value={total} />
                      <Stat label="Received" value={receivedShown} tone={receivedShown > 0 ? 'good' : undefined} />
                      <Stat label="Backorder" value={backShown ?? 0} tone={backShown === 0 ? 'good' : backShown != null && backShown < total ? 'warn' : undefined} />
                    </div>
                    {backShown === 0 ? (
                      <Banner tone="success" icon="✅">Backorder is 0 — the item is fully received and marked <strong>Received</strong>.</Banner>
                    ) : (
                      entryForm(qty, setQty, note, setNote, date, setDate, addToSite, back, '➕ Register delivery')
                    )}
                    {log(siteLog, 'Delivery log')}
                  </>
                )}
              </div>

              {/* ---------------------------------------------- 2 · installation */}
              <div style={panel}>
                <div>
                  {sectionTitle(<>{handOff}2 · INSTALLATION</>)}
                  <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 3 }}>How much of what is here is up on the wall. Installing it closes the lifecycle.</div>
                </div>

                {/* How many of the ones that ARE here are up on the wall (lote 44). The
                    install used to be a single boolean while the delivery already had
                    quantities and a log, so "we put up the 5 that arrived out of the 10 we
                    bought" could not be said — and the client report read the item as fully
                    installed. This is that half of the cycle catching up. */}
                {showInstallQty ? (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Stat label="Here" value={instCap ?? 0} />
                      <Stat label="Installed" value={item.installedQty} tone={item.installedQty > 0 ? 'good' : undefined} />
                      <Stat label="Left to install" value={instPending ?? 0} tone={instPending === 0 ? 'good' : instPending != null && instPending < (instCap ?? 0) ? 'warn' : undefined} />
                    </div>
                    {instPending === 0 ? (
                      <Banner tone="success" icon="✅">
                        {item.installed
                          ? <>Everything bought is installed — the lifecycle is closed.</>
                          : <>Everything that arrived is installed. The rest goes up once the backorder in section 1 lands.</>}
                      </Banner>
                    ) : entryForm(
                      iQty, setIQty, iNote, setINote, iDate, setIDate, addInstallEntry, instPending,
                      '➕ Register installation', undefined, 'Install everything that is here',
                    )}
                    {installLog}
                  </>
                ) : (
                  // The panel is never empty: with nothing received yet it says what has to
                  // happen on the left before anything can happen here.
                  <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
                    {total == null
                      ? 'A numeric QTY is needed before quantities can be tracked.'
                      : 'Nothing has arrived yet — register the delivery on the left and this side opens up.'}
                  </div>
                )}
                {scheduleRow}
              </div>
            </div>

            {/* ------------------------------------ the rail: where is it right now */}
            {/* Spans both panels because the stage belongs to neither half alone — it is
                the item walking from one to the other. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
              {sectionTitle('WHERE IS IT RIGHT NOW?')}
              {stageButtons}

              {locked && (
                <Banner tone="warning" icon="⚠">
                  {item.receivedQty} of {total} arrived — <strong>{back} still on backorder</strong>. You can install what is
                  here; the item stays <em>not received</em> until the rest lands, so it keeps its ⏰ delivery watch and the
                  entry form in section 1. 🏭 and 📍 need the full receipt, so they are off the menu meanwhile.
                </Banner>
              )}

              {/* The stamps of the stages already passed, on one line — they are a record,
                  not the control, so they read across instead of stacking down the modal. */}
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {/* No `!ofci` guard needed anymore — owner-furnished items never reach this
                    shape of the modal; they get `ofciBody` above. */}
                {/* `delivered`, not the stage: an item installed while a backorder was
                    still open has no receipt yet, so there is no date to edit here. */}
                {item.delivered && dateRow('Received', item.receivedDate, (v) => actions.editItem(item.id, { receivedDate: v }))}
                {(stage === 'on-site' || stage === 'installed') && item.siteDate !== '' && dateRow('On site', item.siteDate, (v) => actions.editItem(item.id, { siteDate: v }))}
                {stage === 'installed' && dateRow('Installed', item.installedDate, (v) => actions.editItem(item.id, { installedDate: v }))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, font: 'var(--text-caption)' }}>
                {un && <div style={{ color: urgencyInk, fontWeight: 600 }}>{un.text}</div>}
                {stage !== 'pending' && !closed && waiting != null && (
                  <div style={{ color: 'var(--muted)' }}>
                    {waiting} day{waiting === 1 ? '' : 's'} since received{item.siteDate ? ` · on site since ${fmtMDY(item.siteDate)}` : ' · still in the warehouse'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const bg = tone === 'good' ? 'var(--status-ordered)' : tone === 'warn' ? 'var(--status-partial)' : 'var(--surface-soft)';
  const ink = tone === 'good' ? 'var(--status-ordered-ink)' : tone === 'warn' ? 'var(--status-partial-ink)' : 'var(--ink)';
  return (
    <div style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: bg, border: '1px solid var(--hairline)' }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{label}</div>
      <div style={{ font: 'var(--text-title-md)', fontWeight: 700, color: ink }}>{value}</div>
    </div>
  );
}
