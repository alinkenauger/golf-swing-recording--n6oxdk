import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.x
import { UserProfile } from '../../types/user';

/**
 * Size variants for avatar component with corresponding Tailwind classes
 */
const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
  xl: 'h-24 w-24 text-lg'
} as const;

/**
 * Fallback styles for avatar placeholder
 */
const FALLBACK_COLORS = {
  bg: 'bg-gray-200',
  text: 'text-gray-600'
} as const;

/**
 * Props interface for the Avatar component
 */
interface AvatarProps {
  /** User profile data containing name and avatar information */
  profile: UserProfile;
  /** Size variant of the avatar */
  size: keyof typeof AVATAR_SIZES;
  /** Optional additional CSS classes */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Enable lazy loading for the image */
  lazyLoad?: boolean;
  /** Test ID for testing purposes */
  testId?: string;
}

/**
 * Extracts initials from user's first and last name
 * @param firstName - User's first name
 * @param lastName - User's last name
 * @returns Two letter initials or fallback
 */
const getInitials = (firstName: string, lastName: string): string => {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();

  if (!first && !last) return '??';

  const firstInitial = first.charAt(0);
  const lastInitial = last.charAt(0);

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

/**
 * Avatar component for displaying user profile images with fallback support
 * Implements lazy loading and accessibility features
 */
export const Avatar: React.FC<AvatarProps> = ({
  profile,
  size = 'md',
  className,
  onClick,
  lazyLoad = true,
  testId = 'avatar'
}) => {
  // Memoize initials calculation
  const initials = useMemo(
    () => getInitials(profile.firstName, profile.lastName),
    [profile.firstName, profile.lastName]
  );

  const containerClasses = classNames(
    'rounded-full overflow-hidden flex items-center justify-center',
    AVATAR_SIZES[size],
    onClick && 'cursor-pointer hover:opacity-90 transition-opacity',
    className
  );

  const fallbackClasses = classNames(
    'flex items-center justify-center font-medium',
    FALLBACK_COLORS.bg,
    FALLBACK_COLORS.text,
    AVATAR_SIZES[size]
  );

  const userFullName = `${profile.firstName} ${profile.lastName}`.trim() || 'User';

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      role={onClick ? 'button' : 'img'}
      aria-label={`Avatar for ${userFullName}`}
      data-testid={testId}
    >
      {profile.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt={`${userFullName}'s avatar`}
          className="h-full w-full object-cover"
          loading={lazyLoad ? 'lazy' : 'eager'}
          onError={(e) => {
            // Remove broken image and show fallback
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className={fallbackClasses} aria-hidden="true">
          {initials}
        </div>
      )}
    </div>
  );
};

export default Avatar;