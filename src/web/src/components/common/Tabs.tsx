import React, { useCallback, useEffect, useRef } from 'react';
// @version ^2.3.2
import classNames from 'classnames';

/**
 * Interface defining the structure of a single tab item
 */
interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * Interface defining the props for the Tabs component
 */
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'underline' | 'pills';
  className?: string;
}

/**
 * Generates class names for tab items based on variant and active state
 */
const getTabClasses = (variant: string, isActive: boolean): string => {
  const baseClasses = 'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all duration-200';
  
  const variantClasses = {
    default: classNames(
      'px-4 py-2 text-sm font-medium',
      isActive ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
    ),
    underline: classNames(
      'px-1 py-4 text-sm font-medium border-b-2',
      isActive ? 'text-primary-600 border-primary-600' : 'text-gray-500 border-transparent hover:text-gray-700'
    ),
    pills: classNames(
      'px-3 py-2 text-sm font-medium rounded-md',
      isActive ? 'text-white bg-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    )
  };

  return classNames(baseClasses, variantClasses[variant as keyof typeof variantClasses]);
};

/**
 * Accessible tab component supporting multiple style variants and keyboard navigation
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  className
}) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  /**
   * Handles keyboard navigation between tabs
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const tabCount = tabs.length;
    let newIndex: number;

    switch (event.key) {
      case 'ArrowLeft':
        newIndex = (index - 1 + tabCount) % tabCount;
        break;
      case 'ArrowRight':
        newIndex = (index + 1) % tabCount;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = tabCount - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabRefs.current[newIndex]?.focus();
    onChange(tabs[newIndex].id);
  }, [tabs, onChange]);

  /**
   * Handles mouse click selection of tabs
   */
  const handleClick = useCallback((tabId: string) => {
    onChange(tabId);
  }, [onChange]);

  /**
   * Ensures proper focus management when active tab changes
   */
  useEffect(() => {
    const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
    if (activeIndex !== -1) {
      tabRefs.current[activeIndex]?.focus();
    }
  }, [activeTab, tabs]);

  return (
    <div className={classNames('flex flex-col w-full', className)}>
      {/* Tab List */}
      <div
        role="tablist"
        className="flex border-b border-gray-200"
        aria-label="Tabs"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          
          return (
            <button
              key={tab.id}
              ref={el => (tabRefs.current[index] = el)}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={getTabClasses(variant, isActive)}
              onClick={() => handleClick(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {tabs.map(tab => (
        <div
          key={`panel-${tab.id}`}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== activeTab}
          className={classNames(
            'focus:outline-none',
            'pt-4'
          )}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
};

export type { Tab, TabsProps };