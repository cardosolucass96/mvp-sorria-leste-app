import { useState, useEffect } from 'react';

/**
 * Debounce a value by a given delay.
 * Returns the debounced value that only updates after the delay has passed.
 *
 * @example
 * const [busca, setBusca] = useState('');
 * const buscaDebounced = useDebounce(busca, 300);
 *
 * useEffect(() => {
 *   fetchResults(buscaDebounced);
 * }, [buscaDebounced]);
 */
export default function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
