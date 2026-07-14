import { cn } from '@/lib/utils';
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
interface AvatarColor {
  bg: string;
  text: string;
}

function hashColor(name: string): AvatarColor {
  const colors: AvatarColor[] = [
    { bg: 'bg-primary', text: 'text-primary-foreground' },
    { bg: 'bg-info-500', text: 'text-info-50' },
    { bg: 'bg-success-500', text: 'text-success-50' },
    { bg: 'bg-evaluation-500', text: 'text-evaluation-50' },
    { bg: 'bg-error-500', text: 'text-error-50' },
    { bg: 'bg-warning-500', text: 'text-warning-50' },
    { bg: 'bg-dentist-500', text: 'text-dentist-50' },
    { bg: 'bg-info-600', text: 'text-info-50' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ nome, size = 'md', className = '' }: AvatarProps) {
  const initials = obterIniciais(nome);
  const { bg, text } = hashColor(nome);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "font-semibold select-none shrink-0",
        text,
        bg,
        sizeClasses[size],
        className
      )}
      title={nome}
      aria-label={nome}
    >
      {initials}
    </span>
  );
}
