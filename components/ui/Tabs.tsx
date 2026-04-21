'use client';

import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
      <div className={cn("border-b border-border", className)}>
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
                className={cn(
                  "whitespace-nowrap border-b-2 font-medium transition-colors",
                  size === 'sm' ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
                )}
              >
                {tab.label}
                {tab.count != null && (
                  <span
                    className={cn(
                      "ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold",
                      isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
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
      className={cn("flex flex-wrap gap-1 p-1 bg-muted rounded-lg", className)}
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
            className={cn(
              "rounded-md font-medium transition-all",
              size === 'sm' ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
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
