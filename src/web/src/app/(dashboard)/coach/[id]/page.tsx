'use client';

import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { CoachProfile } from '../../../../components/coach/CoachProfile';
import { Loading } from '../../../../components/common/Loading';
import { ErrorBoundary } from '../../../../components/common/ErrorBoundary';
import { CoachService } from '../../../../services/coach.service';
import { ApiError } from '../../../../types/common';

// Initialize coach service with retry configuration
const coachService = new CoachService(
  process.env.NEXT_PUBLIC_API_URL || '',
  require('cache-manager')
);

interface PageProps {
  params: {
    id: string;
  };
  searchParams: {
    edit?: string;
  };
}

interface CoachProfileData {
  id: string;
  name: string;
  bio: string;
  specialties: string[];
  certifications: string[];
}

/**
 * Generates enhanced metadata for coach profile pages with SEO optimization
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { data: coach } = await coachService.getCoachProfile(params.id);

    const title = `${coach.userId} - Professional Coach | Video Coaching Platform`;
    const description = `Learn from ${coach.userId}, a professional coach with ${coach.experience} years of experience. Specializing in ${coach.specialties.join(', ')}. View training programs and book sessions.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'profile',
        profile: {
          username: coach.userId,
          firstName: coach.userId.split(' ')[0],
          lastName: coach.userId.split(' ')[1] || '',
        },
        images: [{
          url: coach.profileImage || '/default-coach-image.jpg',
          width: 1200,
          height: 630,
          alt: `${coach.userId}'s profile picture`
        }]
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [coach.profileImage || '/default-coach-image.jpg']
      },
      robots: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1
      }
    };
  } catch (error) {
    // Fallback metadata if coach profile fetch fails
    return {
      title: 'Coach Profile | Video Coaching Platform',
      description: 'View professional coach profile and training programs.',
      robots: { index: false }
    };
  }
}

/**
 * Coach profile page component with comprehensive error handling and accessibility
 */
export default async function CoachProfilePage({ params, searchParams }: PageProps) {
  const isEditable = searchParams.edit === 'true';

  // Error boundary fallback UI
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div 
      role="alert" 
      className="p-6 bg-red-50 rounded-lg border border-red-100"
    >
      <h2 className="text-lg font-semibold text-red-800 mb-2">
        Failed to load coach profile
      </h2>
      <p className="text-sm text-red-600 mb-4">
        {error instanceof ApiError ? error.message : 'An unexpected error occurred'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        Retry
      </button>
    </div>
  );

  // Error logging callback
  const handleError = (error: Error) => {
    console.error('Coach profile error:', {
      coachId: params.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  };

  try {
    // Fetch coach profile with retry logic
    const { data: coach, error } = await coachService.getCoachProfile(params.id);

    if (error || !coach) {
      notFound();
    }

    return (
      <ErrorBoundary 
        fallback={ErrorFallback} 
        onError={handleError}
      >
        <main 
          className="container mx-auto px-4 py-8"
          aria-labelledby="coach-profile-heading"
        >
          <h1 
            id="coach-profile-heading" 
            className="sr-only"
          >
            Coach Profile for {coach.userId}
          </h1>
          
          <CoachProfile
            coachId={params.id}
            isEditable={isEditable}
            onError={handleError}
          />
        </main>
      </ErrorBoundary>
    );
  } catch (error) {
    if ((error as ApiError)?.statusCode === 404) {
      notFound();
    }
    throw error; // Let Next.js error boundary handle other errors
  }
}