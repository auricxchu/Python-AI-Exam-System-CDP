import { useEffect, useState } from 'react';
import { resolveImageUrl } from '../services/imageCacheService';

export const useResolvedImageUrl = (url?: string | null) => {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!url) {
      setResolved(null);
      return;
    }
    resolveImageUrl(url)
      .then((val) => {
        if (active) setResolved(val);
      })
      .catch(() => {
        if (active) setResolved(url);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return resolved;
};
