// DemoBanner.tsx — public-demo only. Says the two things a first-time visitor needs to
// know (the data is invented, the storage is their own browser) and gives them the way
// back to a clean slate after they have clicked around. Dismissal is persisted so it
// does not nag on every navigation.
import { Banner } from './ds/Banner';
import { Button } from './ds/Button';
import { clearAll } from '../store/persist';
import { usePersisted } from '../store/usePersisted';

export function DemoBanner() {
  const [dismissed, setDismissed] = usePersisted('demoBannerDismissed', false);
  if (dismissed) return null;

  const reset = () => {
    if (!window.confirm('Reset the demo? Every change you made in this browser is discarded and the sample projects come back.')) return;
    clearAll();
    window.location.reload();
  };

  return (
    <div className="no-print" style={{ marginBottom: 20 }}>
      <Banner tone="info" icon="👋">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>
            <strong>Live demo.</strong> Every project, vendor and product below is invented. Your edits stay in this
            browser only — nothing is uploaded.
          </span>
          <Button variant="secondary" size="sm" onClick={reset}>↺ Reset demo data</Button>
          <Button variant="secondary" size="sm" onClick={() => setDismissed(true)}>Got it</Button>
        </span>
      </Banner>
    </div>
  );
}
