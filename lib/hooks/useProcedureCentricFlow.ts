'use client';

import { useEffect, useState } from 'react';

export function useProcedureCentricFlow() {
  const [enabled, setEnabled] = useState<boolean | null>(() => (
    typeof fetch === 'function' ? null : false
  ));

  useEffect(() => {
    if (typeof fetch !== 'function') return;

    let active = true;
    void fetch('/api/v2/status')
      .then(async (response) => response.ok ? response.json() as Promise<{ enabled?: boolean }> : { enabled: false })
      .then((data) => {
        if (active) setEnabled(data.enabled === true);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => { active = false; };
  }, []);

  return enabled;
}
