import { obterIniciais } from '@/lib/utils/formatters';

export interface AvatarProps {
  nome: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

/** Gera cor determinística baseada no nome */
function hashColor(name: string): string {
  const colors = [
    'bg-primary-500',
    'bg-info-500',
    'bg-success-500',
    'bg-purple-500',
    'bg-error-500',
    'bg-warning-500',
    'bg-teal-500',
    'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ nome, size = 'md', className = '' }: AvatarProps) {
  const initials = obterIniciais(nome);
  const bg = hashColor(nome);

  return (
    <span
      className={`
        inline-flex items-center justify-center rounded-full
        text-white font-semibold select-none shrink-0
        ${bg}
        ${sizeClasses[size]}
        ${className}
      `.trim()}
      title={nome}
      aria-label={nome}
    >
      {initials}
    </span>
  );
}
