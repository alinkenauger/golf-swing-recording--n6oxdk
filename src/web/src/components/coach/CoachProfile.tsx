import React, { useEffect, useState, useCallback } from 'react'; // ^18.0.0
import classNames from 'classnames'; // ^2.3.2
import { useInView } from 'react-intersection-observer'; // ^9.5.2

import { Coach, Program, ProgramLevel, VerificationStatus } from '../../types/coach';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Loading } from '../common/Loading';
import { ApiError, LoadingState } from '../../types/common';

interface CoachProfileProps {
  coachId: string;
  isEditable?: boolean;
  onContactClick?: () => void;
  onAnalyticsUpdate?: (analytics: CoachAnalytics) => void;
  onError?: (error: Error) => void;
  showAnalytics?: boolean;
}

interface CoachAnalytics {
  totalRevenue: number;
  monthlyRevenue: number;
  studentCount: number;
  programCount: number;
  averageRating: number;
  completionRate: number;
}

interface CoachProfileState {
  coach: Coach | null;
  programs: Program[];
  loadingState: LoadingState;
  analyticsData: CoachAnalytics | null;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const CoachProfile: React.FC<CoachProfileProps> = ({
  coachId,
  isEditable = false,
  onContactClick,
  onAnalyticsUpdate,
  onError,
  showAnalytics = true,
}) => {
  const [state, setState] = useState<CoachProfileState>({
    coach: null,
    programs: [],
    loadingState: { state: 'idle', error: null },
    analyticsData: null,
  });

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const fetchCoachData = useCallback(async () => {
    setState(prev => ({
      ...prev,
      loadingState: { state: 'loading', error: null },
    }));

    try {
      const [coachData, programsData] = await Promise.all([
        fetch(`/api/coaches/${coachId}`).then(res => res.json()),
        fetch(`/api/coaches/${coachId}/programs`).then(res => res.json()),
      ]);

      setState(prev => ({
        ...prev,
        coach: coachData,
        programs: programsData,
        loadingState: { state: 'success', error: null },
        analyticsData: {
          totalRevenue: coachData.totalEarnings,
          monthlyRevenue: coachData.monthlyEarnings.reduce((sum: number, month: any) => sum + month.amount, 0),
          studentCount: coachData.studentCount,
          programCount: coachData.programCount,
          averageRating: coachData.rating,
          completionRate: programsData.reduce((avg: number, prog: Program) => 
            avg + prog.analytics.completionRate, 0) / programsData.length,
        },
      }));

      if (onAnalyticsUpdate) {
        onAnalyticsUpdate(state.analyticsData!);
      }
    } catch (error) {
      const apiError = error as ApiError;
      setState(prev => ({
        ...prev,
        loadingState: { 
          state: 'error',
          error: apiError,
        },
      }));
      if (onError) {
        onError(error as Error);
      }
    }
  }, [coachId, onAnalyticsUpdate, onError]);

  useEffect(() => {
    if (inView) {
      fetchCoachData();
    }
  }, [inView, fetchCoachData]);

  const renderVerificationBadge = () => {
    if (!state.coach) return null;

    return (
      <div 
        className={classNames(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          {
            'bg-green-100 text-green-800': state.coach.verificationStatus === VerificationStatus.VERIFIED,
            'bg-yellow-100 text-yellow-800': state.coach.verificationStatus === VerificationStatus.PENDING,
            'bg-red-100 text-red-800': state.coach.verificationStatus === VerificationStatus.REJECTED,
          }
        )}
        role="status"
        aria-label={`Verification status: ${state.coach.verificationStatus}`}
      >
        {state.coach.verificationStatus}
      </div>
    );
  };

  const renderAnalytics = () => {
    if (!showAnalytics || !state.analyticsData) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6" role="region" aria-label="Coach analytics">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Revenue</h3>
          <div className="mt-2">
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(state.analyticsData.totalRevenue)}
            </p>
            <p className="text-sm text-gray-500">
              {formatCurrency(state.analyticsData.monthlyRevenue)} this month
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Students</h3>
          <div className="mt-2">
            <p className="text-2xl font-semibold text-gray-900">
              {state.analyticsData.studentCount}
            </p>
            <p className="text-sm text-gray-500">
              {state.analyticsData.completionRate.toFixed(1)}% completion rate
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Rating</h3>
          <div className="mt-2">
            <p className="text-2xl font-semibold text-gray-900">
              {state.analyticsData.averageRating.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">
              {state.coach?.reviewCount} reviews
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderPrograms = () => {
    if (!state.programs.length) return null;

    return (
      <div className="mt-8" role="region" aria-label="Training programs">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Training Programs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {state.programs.map(program => (
            <div 
              key={program.id}
              className="bg-white rounded-lg shadow overflow-hidden"
              role="article"
              aria-labelledby={`program-title-${program.id}`}
            >
              <div className="p-4">
                <h3 
                  id={`program-title-${program.id}`}
                  className="text-lg font-medium text-gray-900"
                >
                  {program.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500">{program.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-lg font-medium text-gray-900">
                    {formatCurrency(program.price)}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {program.level}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (state.loadingState.state === 'loading') {
    return <Loading size="large" message="Loading coach profile..." />;
  }

  if (state.loadingState.state === 'error') {
    return (
      <div 
        className="bg-red-50 p-4 rounded-md"
        role="alert"
        aria-live="polite"
      >
        <p className="text-red-800">
          Failed to load coach profile: {state.loadingState.error?.message}
        </p>
      </div>
    );
  }

  if (!state.coach) {
    return null;
  }

  return (
    <ErrorBoundary onError={onError}>
      <div 
        ref={ref}
        className="bg-gray-50 p-6 rounded-lg"
        role="main"
        aria-label="Coach profile"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {state.coach.userId}
            </h1>
            <div className="mt-2 flex items-center space-x-2">
              {renderVerificationBadge()}
              <span className="text-sm text-gray-500">
                {state.coach.experience} years experience
              </span>
            </div>
          </div>
          
          {onContactClick && (
            <button
              onClick={onContactClick}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              aria-label="Contact coach"
            >
              Contact
            </button>
          )}
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-medium text-gray-900">Specialties</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.coach.specialties.map(specialty => (
              <span
                key={specialty}
                className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
              >
                {specialty}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-medium text-gray-900">Certifications</h2>
          <div className="mt-2 space-y-3">
            {state.coach.certifications.map(cert => (
              <div
                key={cert.id}
                className="flex items-center justify-between bg-white p-3 rounded-md shadow-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{cert.name}</p>
                  <p className="text-sm text-gray-500">Issued by {cert.issuer}</p>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(cert.issueDate).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {renderAnalytics()}
        {renderPrograms()}

        {isEditable && (
          <div className="mt-8 flex justify-end">
            <button
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={() => {/* Handle edit */}}
              aria-label="Edit profile"
            >
              Edit Profile
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default CoachProfile;