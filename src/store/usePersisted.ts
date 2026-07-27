// usePersisted — useState that survives navigation (and reloads) via localStorage.
// Used to keep the last Submittals filter and the grid's column state across navigation.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { loadJSON, saveJSON } from './persist';

export function usePersisted<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = loadJSON<T>(key);
    return stored === null ? initial : stored;
  });
  useEffect(() => { saveJSON(key, value); }, [key, value]);
  return [value, setValue];
}
