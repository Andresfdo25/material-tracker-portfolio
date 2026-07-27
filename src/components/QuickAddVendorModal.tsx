import { useState } from 'react';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { TextInput } from './ds/TextInput';

export function QuickAddVendorModal({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    onClose();
  };

  return (
    <Modal title="Quick add vendor" onClose={onClose} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          Vendor name
          <TextInput
            placeholder="e.g. Acme Supply Co"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!name.trim()}>Add vendor</Button>
        </div>
      </div>
    </Modal>
  );
}
