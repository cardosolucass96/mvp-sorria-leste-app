'use client';

import { useState, useRef, useId } from 'react';

export interface TooltipProps {
  content: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
  className?: string;
}

const positionClasses: Record<NonNullable<TooltipProps['position']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
};

export default function Tooltip({
  content,
  position = 'top',
  children,
  className = '',
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>

      {visible && (
        <span
          id={id}
          role="tooltip"
          className={`
            absolute z-50 px-2.5 py-1.5 text-xs font-medium
            bg-gray-900 text-white rounded-lg shadow-lg
            whitespace-nowrap pointer-events-none
            ${positionClasses[position]}
          `.trim()}
        >
          {content}
        </span>
      )}
    </span>
  );
}
