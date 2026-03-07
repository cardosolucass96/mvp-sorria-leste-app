import Link from 'next/link';

export interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  href?: string;
  description?: string;
  className?: string;
}

export default function StatCard({
  icon,
  label,
  value,
  color = 'border-orange-400',
  href,
  description,
  className = '',
}: StatCardProps) {
  const content = (
    <div
      className={`
        bg-white rounded-xl shadow-md border border-orange-100 p-5
        border-l-4 ${color}
        ${href ? 'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200' : ''}
        ${className}
      `.trim()}
    >
      <div className="flex items-start gap-4">
        <span className="text-2xl shrink-0" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
          {description && (
            <p className="text-xs text-gray-400 mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}
