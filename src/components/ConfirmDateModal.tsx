// ConfirmDateModal.tsx — replaces `window.confirm` on every board write that moves
// material (ported from the private build's lote 64). The PM registers a movement, he
// doesn't necessarily witness it: the crew installed Thursday and he logs it Monday, the
// truck arrived Friday and the invoice shows up a week later. Stamping today on every
// click turned the board into a record of when the click happened, which is the one date
// nobody needs.
//
// Not a confirm with a date bolted on: it's the same confirm as always — what gets
// written, and that the package publishes in the same gesture — with the date field
// inside it, focused, and Enter to confirm. One step, not two.
//
// Writes nothing itself: `onConfirm(iso)` is the caller's, same as every other board
// modal here. The screen owns the actions and the Undo.
import { useState, type ReactNode } from 'react';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';

/** Everything needed to ask for ONE date. The screen builds this in the button handler
 * and stores it in state; the modal mounts for as long as it exists. */
export interface DatePrompt {
  title: ReactNode;
  /** The old `window.confirm` body — what it writes, what it does NOT write, and the
   * publish notice. Sits above the field because it's what decides whether to confirm. */
  body: ReactNode;
  /** Field label — "Received on", "Installed on"… the verb matters: it distinguishes the
   * date of the event from the date of the record. */
  label: string;
  /** Initial value (ISO) — today in almost every case. */
  date: string;
  confirmLabel: string;
  onConfirm: (iso: string) => void;
}

export function ConfirmDateModal({ prompt, onCancel }: { prompt: DatePrompt; onCancel: () => void }) {
  const [date, setDate] = useState(prompt.date);
  const commit = () => { if (date) prompt.onConfirm(date); };
  return (
    <Modal title={prompt.title} onClose={onCancel} width={520}>
      <div style={{ font: 'var(--text-body)', color: 'var(--ink)', marginBottom: 16 }}>{prompt.body}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 700 }}>{prompt.label}</span>
        <input
          type="date"
          autoFocus
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && date) commit(); }}
          style={{
            height: 38, padding: '0 10px', borderRadius: 'var(--radius-sm)',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)',
            font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)',
          }}
        />
      </label>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
        The date the movement actually happened — not today, unless it was today.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!date} onClick={commit}>{prompt.confirmLabel}</Button>
      </div>
    </Modal>
  );
}
