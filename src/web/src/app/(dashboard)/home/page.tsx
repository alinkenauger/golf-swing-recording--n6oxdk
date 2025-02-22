'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Analytics } from '@segment/analytics-next'; // ^1.55.0

import VideoList from '../../../components/video/VideoList';
import CoachCard from '../../../components/coach/CoachCard';
import { useAuth } from '../../../hooks/useAuth';
import { Video } from '../../../types/video';
import { Coach } from '../../../types/coach';
import { ApiError, HttpStatusCode } from '../../../types/common';
import { apiClient } from '../../../lib/api';

/**
 * Custom hook for fetching and managing dashboard data
 */
const useHomeData = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const { user, validateSession } = useAuth();

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate user session before fetching data
      const isSessionValid = await validateSession();
      if (!isSessionValid) {
        throw new Error('Invalid session');
      }

      // Fetch recent videos and recommended coaches in parallel
      const [videosResponse, coachesResponse] = await Promise.all([
        apiClient.get<Video[]>('/videos/recent'),
        apiClient.get<Coach[]>('/coaches/recommended')
      ]);

      if (videosResponse.success && coachesResponse.success) {
        setVideos(videosResponse.data);
        setCoaches(coachesResponse.data);

        // Track successful data load
        Analytics.track('dashboard_data_loaded', {
          userId: user?.id,
          videosCount: videosResponse.data.length,
          coachesCount: coachesResponse.data.length
        });
      }
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      setError({
        code: 'FETCH_ERROR',
        message: 'Failed to load dashboard data',
        details: {},
        stack: process.env.NODE_ENV === 'development' ? (err as Error).stack : undefined
      });

      // Track error for monitoring
      Analytics.track('dashboard_data_error', {
        userId: user?.id,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, validateSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    videos,
    coaches,
    isLoading,
    error,
    retry: fetchData
  };
};

/**
 * Enhanced dashboard home page component with accessibility and security features
 */
const HomePage: React.FC = () => {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { videos, coaches, isLoading, error, retry } = useHomeData();

  // Handle unauthorized access
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Handle coach profile navigation with analytics
  const handleCoachClick = useCallback((coach: Coach) => {
    Analytics.track('coach_profile_click', {
      userId: user?.id,
      coachId: coach.id,
      source: 'dashboard'
    });
    router.push(`/coaches/${coach.id}`);
  }, [user, router]);

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <main 
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      role="main"
      aria-label="Dashboard Home"
    >
      {/* Welcome Section */}
      <section className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back, {user.firstName}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {user.role === 'COACH' ? 'Manage your coaching activities and connect with athletes.' : 'Track your progress and connect with coaches.'}
        </p>
      </section>

      {/* Recent Videos Grid */}
      <section 
        className="mb-12"
        aria-labelledby="recent-videos-heading"
      >
        <h2 
          id="recent-videos-heading"
          className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Recent Videos
        </h2>
        <VideoList
          videos={videos}
          isLoading={isLoading}
          onError={(error) => {
            console.error('Video list error:', error);
            Analytics.track('video_list_error', {
              userId: user.id,
              error: error.message
            });
          }}
          className="min-h-[200px]"
        />
      </section>

      {/* Recommended Coaches */}
      <section 
        className="mb-12"
        aria-labelledby="recommended-coaches-heading"
      >
        <h2 
          id="recommended-coaches-heading"
          className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Recommended Coaches
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coaches.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              onClick={() => handleCoachClick(coach)}
              testId={`coach-card-${coach.id}`}
            />
          ))}
        </div>
      </section>

      {/* Error State */}
      {error && (
        <div 
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8"
        >
          <h3 className="text-red-800 font-medium mb-2">
            Error Loading Dashboard
          </h3>
          <p className="text-red-600 text-sm mb-3">
            {error.message}
          </p>
          <button
            onClick={retry}
            className="text-red-700 hover:text-red-800 text-sm font-medium"
            aria-label="Retry loading dashboard data"
          >
            Try Again
          </button>
        </div>
      )}
    </main>
  );
};

export default HomePage;