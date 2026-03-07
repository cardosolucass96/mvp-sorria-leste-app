export interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated';
  noPadding?: boolean;
  borderColor?: string;
  className?: string;
  onClick?: () => void;
}

const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-white shadow-md border border-orange-100',
  outlined: 'bg-white border-2 border-gray-200',
  elevated: 'bg-white shadow-lg border border-orange-100',
};

export default function Card({
  children,
  variant = 'default',
  noPadding = false,
  borderColor,
  className = '',
  onClick,
}: CardProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`
        rounded-xl transition-all duration-200
        ${variantClasses[variant]}
        ${noPadding ? '' : 'p-6'}
        ${borderColor ? `border-l-4 ${borderColor}` : ''}
        ${onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 w-full text-left' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </Tag>
  );
}
