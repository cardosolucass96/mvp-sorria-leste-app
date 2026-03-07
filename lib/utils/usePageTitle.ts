'use client';

import { useEffect } from 'react';

/** Utilitário para definir o título da página em client components. */
export default function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} | Sorria Leste` : 'Sorria Leste';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
