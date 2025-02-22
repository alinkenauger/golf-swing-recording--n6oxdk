import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import classNames from 'classnames';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

interface DashboardLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
}

/**
 * Custom hook to manage responsive layout state
 */
const useResponsiveLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setIsSidebarCollapsed(window.innerWidth < 768);
    };

    // Set initial state
    handleResize();

    // Add event listener with debounce
    let resizeTimer: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  return { isSidebarCollapsed, toggleSidebar, windowWidth };
};

/**
 * Main dashboard layout component that provides consistent structure with responsive design
 * and accessibility features following WCAG 2.1 Level AA standards.
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = React.memo(({ children, pageTitle }) => {
  const router = useRouter();
  const { isAuthenticated, user, loading } = useAuth();
  const { isSidebarCollapsed, toggleSidebar, windowWidth } = useResponsiveLayout();

  // Handle authentication and routing
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Handle loading state
  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse">
          <div className="h-8 w-8 bg-primary-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded z-50"
      >
        Skip to main content
      </a>

      {/* Header */}
      <Header
        className="fixed top-0 left-0 right-0 z-30"
        onMenuToggle={windowWidth < 768 ? toggleSidebar : undefined}
      />

      <div className="flex pt-16 h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onCollapse={toggleSidebar}
          className={classNames(
            'fixed left-0 h-full z-20 transition-transform duration-300 ease-in-out',
            {
              '-translate-x-full md:translate-x-0': isSidebarCollapsed,
              'translate-x-0': !isSidebarCollapsed
            }
          )}
        />

        {/* Main content */}
        <main
          id="main-content"
          className={classNames(
            'flex-1 overflow-auto transition-all duration-300 ease-in-out',
            {
              'ml-0 md:ml-20': isSidebarCollapsed,
              'ml-0 md:ml-64': !isSidebarCollapsed
            }
          )}
          role="main"
          aria-label={pageTitle || 'Dashboard content'}
        >
          <ErrorBoundary
            fallback={
              <div className="p-4 text-red-600 bg-red-50 rounded-lg m-4">
                An error occurred while loading the content.
              </div>
            }
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {pageTitle && (
                <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                  {pageTitle}
                </h1>
              )}
              {children}
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
});

DashboardLayout.displayName = 'DashboardLayout';

export { DashboardLayout };
export type { DashboardLayoutProps };