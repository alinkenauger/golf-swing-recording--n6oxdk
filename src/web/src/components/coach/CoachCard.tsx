import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.3.2
import { StarIcon } from '@heroicons/react/24/solid'; // v2.0.0
import { Analytics } from '@analytics/react'; // v0.1.0

import Avatar from '../common/Avatar';
import Card from '../common/Card';
import { Coach } from '../../types/coach';

/**
 * Props interface for CoachCard component
 */
interface CoachCardProps {
  /** Complete coach profile data */
  coach: Coach;
  /** Additional CSS classes for styling customization */
  className?: string;
  /** Click handler with coach data parameter */
  onClick?: (coach: Coach) => void;
  /** Data test id for testing purposes */
  testId?: string;
}

/**
 * Formats rating number to one decimal place with error handling
 */
const formatRating = (rating: number): string => {
  if (!rating && rating !== 0) return 'N/A';
  return Number(rating).toFixed(1);
};

/**
 * Formats hourly rate with currency symbol and localization
 */
const formatPrice = (price: number): string => {
  if (!price && price !== 0) return 'Price not set';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price) + '/hr';
};

/**
 * Accessible card component displaying comprehensive coach information
 * Implements WCAG 2.1 Level AA compliance with proper ARIA labels and keyboard navigation
 */
const CoachCard: React.FC<CoachCardProps> = ({
  coach,
  className,
  onClick,
  testId = 'coach-card'
}) => {
  // Memoize formatted values to prevent unnecessary recalculations
  const formattedRating = useMemo(() => formatRating(coach.rating), [coach.rating]);
  const formattedPrice = useMemo(() => formatPrice(coach.hourlyRate), [coach.hourlyRate]);

  // Track card view for analytics
  React.useEffect(() => {
    Analytics.track('coach_card_view', {
      coachId: coach.id,
      specialties: coach.specialties
    });
  }, [coach.id, coach.specialties]);

  // Handle card click with analytics tracking
  const handleClick = () => {
    Analytics.track('coach_card_click', {
      coachId: coach.id,
      source: 'coach_card'
    });
    onClick?.(coach);
  };

  return (
    <Card
      variant="elevated"
      padding="medium"
      className={classNames(
        'w-full transition-transform hover:scale-[1.02]',
        'focus-within:ring-2 focus-within:ring-primary-500',
        className
      )}
      onClick={handleClick}
      testId={testId}
      role="article"
      aria-label={`Profile card for coach ${coach.profile.firstName} ${coach.profile.lastName}`}
    >
      {/* Card Header with Avatar and Name */}
      <div className="flex items-start space-x-4">
        <Avatar
          profile={coach.profile}
          size="lg"
          className="flex-shrink-0"
          testId={`${testId}-avatar`}
        />
        <div className="flex-grow min-w-0">
          <h3 
            className="text-lg font-semibold text-gray-900 truncate"
            id={`${testId}-name`}
          >
            {coach.profile.firstName} {coach.profile.lastName}
          </h3>
          <div className="flex items-center space-x-2 mt-1">
            <div 
              className="flex items-center text-yellow-500"
              aria-label={`Rating: ${formattedRating} out of 5 stars`}
            >
              <StarIcon className="h-5 w-5" aria-hidden="true" />
              <span className="ml-1 text-sm font-medium">{formattedRating}</span>
            </div>
            <span className="text-sm text-gray-500">
              ({coach.reviewCount} reviews)
            </span>
          </div>
        </div>
      </div>

      {/* Specialties */}
      <div className="mt-4">
        <h4 className="sr-only">Specialties</h4>
        <div className="flex flex-wrap gap-2" aria-label="Coach specialties">
          {coach.specialties.map((specialty, index) => (
            <span
              key={`${specialty}-${index}`}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
            >
              {specialty}
            </span>
          ))}
        </div>
      </div>

      {/* Experience and Price */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <span className="font-medium">{coach.experience}+ years</span> experience
        </div>
        <div 
          className="text-lg font-semibold text-primary-600"
          aria-label={`Hourly rate: ${formattedPrice}`}
        >
          {formattedPrice}
        </div>
      </div>

      {/* Certifications Preview */}
      {coach.certifications && coach.certifications.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900">Certified in:</h4>
          <div className="mt-2 text-sm text-gray-500">
            {coach.certifications.slice(0, 2).map((cert, index) => (
              <div key={cert.id} className="truncate">
                {cert.name} - {cert.issuer}
              </div>
            ))}
            {coach.certifications.length > 2 && (
              <div className="text-primary-600">
                +{coach.certifications.length - 2} more
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default React.memo(CoachCard);