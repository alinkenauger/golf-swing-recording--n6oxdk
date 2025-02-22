'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useInfiniteScroll from 'react-infinite-scroll-hook';
import debounce from 'lodash/debounce'; // ^4.17.21

import CoachCard from '../../../components/coach/CoachCard';
import Loading from '../../../components/common/Loading';
import { coachService } from '../../../services/coach.service';
import { Coach } from '../../../types/coach';

// Default filter values
const DEFAULT_FILTERS: SearchFilters = {
  specialty: [],
  priceRange: { min: 0, max: 500 },
  rating: 0,
  availability: [],
  languages: [],
  experience: 0
};

// Interface for search filters
interface SearchFilters {
  specialty: string[];
  priceRange: {
    min: number;
    max: number;
  };
  rating?: number;
  availability?: string[];
  languages?: string[];
  experience?: number;
}

/**
 * ExplorePage component for discovering and browsing coaches
 * Implements advanced search, filtering, and infinite scrolling
 */
const ExplorePage: React.FC = () => {
  // State management
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');

  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize filters from URL parameters
  useEffect(() => {
    const urlFilters: Partial<SearchFilters> = {
      specialty: searchParams.get('specialty')?.split(',') || [],
      rating: Number(searchParams.get('rating')) || 0,
      experience: Number(searchParams.get('experience')) || 0,
      languages: searchParams.get('languages')?.split(',') || [],
    };

    const priceMin = Number(searchParams.get('priceMin')) || DEFAULT_FILTERS.priceRange.min;
    const priceMax = Number(searchParams.get('priceMax')) || DEFAULT_FILTERS.priceRange.max;

    setFilters({
      ...DEFAULT_FILTERS,
      ...urlFilters,
      priceRange: { min: priceMin, max: priceMax }
    });
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  // Fetch coaches with current filters and pagination
  const fetchCoaches = useCallback(async (pageNum: number) => {
    try {
      setError(null);
      const response = await coachService.getCoachProfile(pageNum.toString());
      
      if (response.success) {
        const newCoaches = response.data as unknown as Coach[];
        setCoaches(prev => pageNum === 1 ? newCoaches : [...prev, ...newCoaches]);
        setHasNextPage(newCoaches.length === 10); // Assuming 10 items per page
      } else {
        setError('Failed to fetch coaches');
      }
    } catch (err) {
      setError('An error occurred while fetching coaches');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced filter handler
  const handleFilterChange = useMemo(
    () =>
      debounce((newFilters: SearchFilters) => {
        setFilters(newFilters);
        setPage(1);
        
        // Update URL with new filters
        const params = new URLSearchParams();
        if (newFilters.specialty.length) params.set('specialty', newFilters.specialty.join(','));
        if (newFilters.rating) params.set('rating', newFilters.rating.toString());
        if (newFilters.experience) params.set('experience', newFilters.experience.toString());
        if (newFilters.languages?.length) params.set('languages', newFilters.languages.join(','));
        params.set('priceMin', newFilters.priceRange.min.toString());
        params.set('priceMax', newFilters.priceRange.max.toString());
        
        router.push(`/explore?${params.toString()}`);
      }, 500),
    [router]
  );

  // Search query handler
  const handleSearch = useMemo(
    () =>
      debounce((query: string) => {
        setSearchQuery(query);
        setPage(1);
        router.push(`/explore?q=${encodeURIComponent(query)}`);
      }, 500),
    [router]
  );

  // Infinite scroll implementation
  const [infiniteRef] = useInfiniteScroll({
    loading,
    hasNextPage,
    onLoadMore: () => {
      setPage(prev => prev + 1);
    },
    disabled: !!error,
    rootMargin: '0px 0px 400px 0px',
  });

  // Initial load and pagination
  useEffect(() => {
    fetchCoaches(page);
  }, [page, filters, searchQuery, fetchCoaches]);

  // Handle coach card click
  const handleCoachClick = useCallback((coach: Coach) => {
    router.push(`/coaches/${coach.id}`);
  }, [router]);

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>{error}</p>
        <button
          onClick={() => fetchCoaches(page)}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search and Filter Section */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 pb-6">
        <div className="flex flex-col space-y-4">
          <input
            type="search"
            placeholder="Search coaches..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full max-w-2xl mx-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            aria-label="Search coaches"
          />
          
          {/* Filter controls would go here - implemented as needed */}
        </div>
      </div>

      {/* Coaches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coaches.map((coach) => (
          <CoachCard
            key={coach.id}
            coach={coach}
            onClick={() => handleCoachClick(coach)}
            className="h-full"
          />
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div ref={infiniteRef}>
          <Loading
            size="large"
            message="Loading more coaches..."
            className="my-8"
          />
        </div>
      )}

      {/* Empty State */}
      {!loading && coaches.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            No coaches found
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
};

export default ExplorePage;