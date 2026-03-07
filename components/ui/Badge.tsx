export interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'yellow';
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'bg-gray-100 text-gray-800',
  orange: 'bg-orange-100 text-orange-800',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  yellow: 'bg-yellow-100 text-yellow-800',
};

const sizeClasses: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({
  children,
  color = 'gray',
  size = 'md',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full whitespace-nowrap
        ${colorClasses[color]}
        ${sizeClasses[size]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}
