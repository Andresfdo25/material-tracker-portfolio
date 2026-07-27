import { useState } from 'react';
import { AppProvider } from './store/AppContext';
import { useApp } from './store/useApp';
import type { TabItem } from './components/ds/TabBar';
import { TabBar } from './components/ds/TabBar';
import { Banner } from './components/ds/Banner';
import { Button } from './components/ds/Button';
import { CreateProjectModal } from './components/CreateProjectModal';
import { APP_VERSION } from './version';
import { VendorDatalist } from './components/VendorInput';
import { CatalogsModal } from './components/CatalogsModal';
import { MaterialListScreen } from './screens/MaterialListScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { SubmittalsScreen } from './screens/SubmittalsScreen';
import { CompletedProjectsModal } from './components/CompletedProjectsModal';
import { DemoBanner } from './components/DemoBanner';

const NAV: TabItem[] = [
  { key: 'overview', label: 'Overview', icon: '🏠' },
  { key: 'list', label: 'Material List', icon: '📋' },
  { key: 'submittals', label: 'Submittals', icon: '📑' },
];

function Shell() {
  const { db, view, nav, flash, undoMessage, actions } = useApp();
  const [showCatalogs, setShowCatalogs] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const completedCount = db.projects.filter((p) => p.archived).length;

  let Screen = MaterialListScreen;
  if (view === 'overview') Screen = OverviewScreen;
  else if (view === 'submittals') Screen = SubmittalsScreen;

  return (
    <div className="app">
      <header className="topbar no-print">
        <span className="brand">◲ Material Tracker</span>
        <Button
          size="sm"
          onClick={() => setShowCreateProject(true)}
          style={{ background: 'var(--brand-orange)', color: '#ffffff', borderColor: 'transparent', padding: '8px 14px' }}
        >
          ＋ New Project
        </Button>
        <span style={{ flex: 1 }} />
        <TabBar items={NAV} active={view} onSelect={(v) => nav(v as typeof view)} />
        {completedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowCompleted(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
              cursor: 'pointer', font: 'var(--text-body)', color: 'var(--muted)', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            📁 Completed ({completedCount})
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span title="App version" style={{ font: 'var(--text-mono-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>v{APP_VERSION}</span>
        <button type="button" className="gear-btn" aria-label="Catalogs & settings" onClick={() => setShowCatalogs(true)}>⚙</button>
      </header>
      <div className="main">
        <DemoBanner />
        {flash && (
          <div className="no-print" style={{ marginBottom: 20, animation: 'flashIn 180ms ease' }}>
            <Banner tone="success" icon="✅">{flash}</Banner>
          </div>
        )}
        <Screen />
      </div>
      {showCatalogs && <CatalogsModal onClose={() => setShowCatalogs(false)} />}
      {showCompleted && <CompletedProjectsModal onClose={() => setShowCompleted(false)} />}
      {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
      <VendorDatalist />
      {undoMessage && (
        <div className="undo-snackbar" role="status">
          <span>💾 {undoMessage}</span>
          <button
            type="button"
            onClick={actions.undoLastSave}
            style={{
              border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: 'var(--on-dark)',
              font: 'var(--text-body)', fontWeight: 600, padding: '5px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            ↩ Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={actions.dismissUndo}
            style={{ border: 'none', background: 'transparent', color: 'var(--on-dark)', opacity: 0.7, cursor: 'pointer', fontSize: 14, padding: 2 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
