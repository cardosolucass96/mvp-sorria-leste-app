import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export * from './utils/index';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
