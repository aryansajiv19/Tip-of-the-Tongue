import { useCallback, useEffect, useState } from 'react';
import { desktop } from '../ui/desktop';
import type { Presence, Provider } from './keys';

// Which keys are set, from the desktop app. null in a browser, and until the app has answered.
export function useKeys() {
  const [status, setStatus] = useState<Record<Provider, Presence> | null>(null);
  const bridge = desktop?.keys;
  const refresh = useCallback(() => {
    bridge
      ?.status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [bridge]);
  useEffect(refresh, [refresh]);
  return { bridge, status, refresh };
}
