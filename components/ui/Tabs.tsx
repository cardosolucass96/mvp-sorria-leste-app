'use client';

export interface Tab {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange?: (key: string) => void;
  onChange?: (key: string) => void;
  variant?: 'pills' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onTabChange,
  onChange,
  variant = 'pills',
  size = 'md',
  className = '',
}: TabsProps) {
  const handleChange = (key: string) => {
    onTabChange?.(key);
    onChange?.(key);
  };
  if (variant === 'underline') {
    return (
      <div className={`border-b border-gray-200 ${className}`}>
        <nav className="flex gap-0 -mb-px overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleChange(tab.key)}
                className={`
                  whitespace-nowrap border-b-2 font-medium transition-colors
                  ${size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}
                  ${isActive
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
                {tab.count != null && (
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      isActive ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  // pills variant (default)
  return (
    <div className={`flex flex-wrap gap-1 p-1 bg-gray-100 rounded-lg ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleChange(tab.key)}
            className={`
              rounded-md font-medium transition-all
              ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}
              ${isActive
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }
            `}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                  isActive ? 'bg-orange-400/30 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
