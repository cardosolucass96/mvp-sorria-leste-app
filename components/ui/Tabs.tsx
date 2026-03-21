'use client';

import { useRef, useCallback } from 'react';

export interface Tab {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  variant?: 'pills' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'pills',
  size = 'md',
  className = '',
}: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.key === activeTab);
      let nextIndex = -1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = tabs.length - 1;
      }

      if (nextIndex >= 0) {
        onTabChange(tabs[nextIndex].key);
        const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[nextIndex]?.focus();
      }
    },
    [tabs, activeTab, onTabChange]
  );

  if (variant === 'underline') {
    return (
      <div className={`border-b border-border ${className}`}>
        <nav
          ref={tabListRef}
          className="flex gap-0 -mb-px overflow-x-auto"
          role="tablist"
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onTabChange(tab.key)}
                className={`
                  whitespace-nowrap border-b-2 font-medium transition-colors
                  ${size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}
                  ${isActive
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                `}
              >
                {tab.label}
                {tab.count != null && (
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      isActive ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-600'
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
    <div
      ref={tabListRef}
      className={`flex flex-wrap gap-1 p-1 bg-neutral-100 rounded-lg ${className}`}
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.key)}
            className={`
              rounded-md font-medium transition-all
              ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}
              ${isActive
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
              }
            `}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                  isActive ? 'bg-primary-400/30 text-white' : 'bg-neutral-200 text-neutral-600'
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
