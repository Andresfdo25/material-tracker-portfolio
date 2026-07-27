// backup.ts — export/import the whole material database as a portable .json file.
// The app has no backend: all real data lives in the `material-tracker:v1:db`
// localStorage key of ONE browser profile. A backup file is how you move that data
// to another computer/profile or keep an off-browser copy. UI-only prefs (theme,
// hidden columns, saved views, filters) are deliberately NOT included — they are
// per-device conveniences and shouldn't clobber the target on import.
import type { Db } from './types';
import { APP_VERSION } from '../version';
import { today } from './logic';

export interface BackupFile {
  kind: 'material-tracker-backup';
  version: string;
  exportedAt: string;
  db: Db;
}

export function buildBackup(db: Db): BackupFile {
  return { kind: 'material-tracker-backup', version: APP_VERSION, exportedAt: new Date().toISOString(), db };
}

export function backupFilename(): string {
  // Local date — a backup exported after 7pm (UTC-5) shouldn't be named with tomorrow's date.
  return `material-tracker-backup-${today()}.json`;
}

/** Validates a backup file's text and returns the raw Db (still needs migrateDb()).
 *  Accepts both a wrapped backup ({kind, db}) and a bare Db object, then throws an
 *  Error with a user-friendly message when the shape isn't recognizable. */
export function parseBackup(text: string): Db {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const wrapped = parsed && typeof parsed === 'object' && 'db' in (parsed as object);
  const db = (wrapped ? (parsed as BackupFile).db : parsed) as Partial<Db>;
  if (!db || typeof db !== 'object' || !Array.isArray(db.projects) || !Array.isArray(db.packages) || !Array.isArray(db.items)) {
    throw new Error('This doesn’t look like a Material Tracker backup.');
  }
  return db as Db;
}

/** Serializes the current db to a pretty JSON file and triggers a browser download. */
export function downloadBackup(db: Db): void {
  const blob = new Blob([JSON.stringify(buildBackup(db), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
