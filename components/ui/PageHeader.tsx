import Link from 'next/link';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  backHref?: string;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  icon,
  backHref,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
            {icon && <span>{icon}</span>}
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
