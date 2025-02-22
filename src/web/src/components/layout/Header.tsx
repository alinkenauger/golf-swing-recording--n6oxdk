import React, { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link'; // ^14.0.0
import { useRouter } from 'next/router'; // ^14.0.0
import { useTranslation } from 'next-i18next'; // ^14.0.0
import { Analytics } from '@segment/analytics-next'; // ^1.0.0
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { UserRole } from '../../types/common';

interface HeaderProps {
  className?: string;
}

interface NavigationItem {
  label: string;
  href: string;
  roles: UserRole[];
}

const Header: React.FC<HeaderProps> = memo(({ className }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Navigation items based on user role
  const navigationItems = useMemo((): NavigationItem[] => {
    const items: NavigationItem[] = [
      {
        label: t('nav.home'),
        href: '/',
        roles: [UserRole.ADMIN, UserRole.COACH, UserRole.ATHLETE]
      }
    ];

    if (user?.role === UserRole.COACH) {
      items.push(
        {
          label: t('nav.dashboard'),
          href: '/coach/dashboard',
          roles: [UserRole.COACH]
        },
        {
          label: t('nav.programs'),
          href: '/coach/programs',
          roles: [UserRole.COACH]
        }
      );
    }

    if (user?.role === UserRole.ATHLETE) {
      items.push(
        {
          label: t('nav.myTraining'),
          href: '/athlete/training',
          roles: [UserRole.ATHLETE]
        },
        {
          label: t('nav.findCoach'),
          href: '/coaches',
          roles: [UserRole.ATHLETE]
        }
      );
    }

    return items;
  }, [user?.role, t]);

  // Handle profile menu toggle with accessibility
  const handleProfileClick = useCallback(() => {
    Analytics.track('Profile Menu Toggle', {
      isOpen: !isProfileMenuOpen
    });
    setIsProfileMenuOpen(!isProfileMenuOpen);
  }, [isProfileMenuOpen]);

  // Handle secure logout
  const handleLogout = useCallback(async () => {
    try {
      Analytics.track('User Logout');
      await logout();
      setIsProfileMenuOpen(false);
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, router]);

  return (
    <header className={`fixed top-0 w-full bg-white border-b border-gray-200 z-50 ${className}`}>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded"
      >
        {t('accessibility.skipToContent')}
      </a>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and brand */}
          <Link href="/" className="flex items-center" aria-label={t('brand.name')}>
            <img
              src="/logo.svg"
              alt={t('brand.logo')}
              className="h-8 w-auto"
              width={32}
              height={32}
            />
            <span className="ml-2 text-xl font-bold text-gray-900">
              {t('brand.name')}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-4" aria-label={t('nav.main')}>
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  router.pathname === item.href
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                aria-current={router.pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User profile section */}
          <div className="flex items-center">
            {isAuthenticated ? (
              <div className="relative ml-3">
                <button
                  type="button"
                  className="flex items-center"
                  onClick={handleProfileClick}
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="true"
                  aria-label={t('profile.toggle')}
                >
                  <Avatar
                    profile={user!.profile}
                    size="sm"
                    className="cursor-pointer"
                  />
                </button>

                {/* Profile dropdown menu */}
                {isProfileMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu"
                  >
                    <div className="py-1" role="none">
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        {t('profile.settings')}
                      </Link>
                      <button
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        onClick={handleLogout}
                        disabled={isLoading}
                      >
                        {t('auth.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/login')}
                  analyticsId="header_login"
                >
                  {t('auth.login')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push('/signup')}
                  analyticsId="header_signup"
                >
                  {t('auth.signup')}
                </Button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              type="button"
              className="md:hidden ml-4 p-2 rounded-md text-gray-700 hover:bg-gray-50"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={t('nav.toggleMenu')}
            >
              <span className="sr-only">{t('nav.toggleMenu')}</span>
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={isMobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden" id="mobile-menu" role="navigation">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  router.pathname === item.href
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                aria-current={router.pathname === item.href ? 'page' : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
});

Header.displayName = 'Header';

export { Header };
export type { HeaderProps };