import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import classNames from 'classnames';
import { analytics } from '@segment/analytics-next';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../common/Button';
import {
  HomeIcon,
  VideoCameraIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

interface SidebarProps {
  isCollapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  className?: string;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactElement;
  roles: string[];
  requiresSubscription?: boolean;
  analyticsEvent?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onCollapse,
  className
}) => {
  const router = useRouter();
  const { isAuthenticated, user, userRole, isPremium } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Generate navigation items based on user role and permissions
  const navItems = useMemo(() => {
    const items: NavItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: <HomeIcon className="h-6 w-6" />,
        roles: ['ADMIN', 'COACH', 'ATHLETE'],
        analyticsEvent: 'Dashboard View'
      },
      {
        id: 'videos',
        label: 'Videos',
        href: '/videos',
        icon: <VideoCameraIcon className="h-6 w-6" />,
        roles: ['ADMIN', 'COACH', 'ATHLETE'],
        analyticsEvent: 'Videos View'
      },
      {
        id: 'messages',
        label: 'Messages',
        href: '/messages',
        icon: <ChatBubbleLeftIcon className="h-6 w-6" />,
        roles: ['ADMIN', 'COACH', 'ATHLETE'],
        analyticsEvent: 'Messages View'
      }
    ];

    // Coach-specific items
    if (userRole === 'COACH') {
      items.push(
        {
          id: 'athletes',
          label: 'Athletes',
          href: '/athletes',
          icon: <UserGroupIcon className="h-6 w-6" />,
          roles: ['COACH'],
          requiresSubscription: true,
          analyticsEvent: 'Athletes View'
        },
        {
          id: 'earnings',
          label: 'Earnings',
          href: '/earnings',
          icon: <CurrencyDollarIcon className="h-6 w-6" />,
          roles: ['COACH'],
          requiresSubscription: true,
          analyticsEvent: 'Earnings View'
        },
        {
          id: 'analytics',
          label: 'Analytics',
          href: '/analytics',
          icon: <ChartBarIcon className="h-6 w-6" />,
          roles: ['COACH'],
          requiresSubscription: true,
          analyticsEvent: 'Analytics View'
        }
      );
    }

    // Settings available to all users
    items.push({
      id: 'settings',
      label: 'Settings',
      href: '/settings',
      icon: <Cog6ToothIcon className="h-6 w-6" />,
      roles: ['ADMIN', 'COACH', 'ATHLETE'],
      analyticsEvent: 'Settings View'
    });

    return items;
  }, [userRole]);

  // Handle navigation with analytics tracking
  const handleNavigation = useCallback((item: NavItem) => {
    if (item.analyticsEvent) {
      analytics.track(item.analyticsEvent, {
        userId: user?.id,
        role: userRole,
        timestamp: new Date().toISOString()
      });
    }
  }, [user?.id, userRole]);

  // Filter navigation items based on user role and subscription
  const filteredNavItems = useMemo(() => {
    return navItems.filter(item => {
      const hasRole = item.roles.includes(userRole);
      const meetsSubscription = !item.requiresSubscription || isPremium;
      return hasRole && meetsSubscription;
    });
  }, [navItems, userRole, isPremium]);

  if (!isAuthenticated) return null;

  return (
    <nav
      className={classNames(
        'flex flex-col bg-white border-r border-gray-200 transition-all duration-300',
        {
          'w-64': !isCollapsed,
          'w-20': isCollapsed
        },
        className
      )}
      aria-label="Main navigation"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        <Link
          href="/dashboard"
          className={classNames('flex items-center', {
            'justify-center w-full': isCollapsed
          })}
        >
          <img
            src="/logo.svg"
            alt="Video Coaching Platform"
            className={classNames('h-8 w-auto', {
              'w-8': isCollapsed
            })}
          />
          {!isCollapsed && (
            <span className="ml-2 text-lg font-semibold text-gray-900">
              Coach Platform
            </span>
          )}
        </Link>

        {/* Collapse Toggle Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCollapse?.(!isCollapsed)}
          className="hidden md:flex"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const isActive = router.pathname.startsWith(item.href);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => handleNavigation(item)}
                  className={classNames(
                    'flex items-center px-2 py-2 rounded-md transition-colors',
                    'min-h-[44px]', // Accessibility: Minimum touch target size
                    {
                      'bg-primary-50 text-primary-700': isActive,
                      'text-gray-700 hover:bg-gray-50': !isActive,
                      'justify-center': isCollapsed
                    }
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    className={classNames('flex items-center', {
                      'justify-center': isCollapsed
                    })}
                  >
                    {React.cloneElement(item.icon, {
                      className: classNames('h-6 w-6', {
                        'text-primary-500': isActive,
                        'text-gray-400': !isActive
                      })
                    })}
                    {!isCollapsed && (
                      <span className="ml-3 text-sm font-medium">
                        {item.label}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Mobile Menu Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden fixed bottom-4 right-4 z-50"
        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="sr-only">
          {isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        </span>
        {isMobileMenuOpen ? (
          <ChevronLeftIcon className="h-5 w-5" />
        ) : (
          <ChevronRightIcon className="h-5 w-5" />
        )}
      </Button>
    </nav>
  );
};

export default React.memo(Sidebar);