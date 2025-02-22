// @package-version react@18.0.0
// @package-version classnames@2.3.2
// @package-version @tanstack/react-virtual@3.0.0

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import classNames from 'classnames';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card } from '../common/Card';
import { Program, ProgramLevel } from '../../types/coach';
import { coachService } from '../../services/coach.service';
import { ApiResponse, PaginatedResponse, LoadingState } from '../../types/common';

interface ProgramListProps {
  coachId: string;
  filters?: {
    level?: ProgramLevel;
    minPrice?: number;
    maxPrice?: number;
    sport?: string;
    rating?: number;
    hasDiscount?: boolean;
  };
  sortBy?: 'price' | 'rating' | 'enrollmentCount' | 'publishedAt' | 'revenue';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  onProgramClick?: (program: Program) => void;
  onAnalyticsUpdate?: (analytics: Program['analytics']) => void;
}

interface ProgramCache {
  data: Program[];
  timestamp: number;
  filters: ProgramListProps['filters'];
  sortBy: ProgramListProps['sortBy'];
  sortOrder: ProgramListProps['sortOrder'];
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const GRID_GAP = 24;
const CARD_MIN_WIDTH = 320;

export const ProgramList: React.FC<ProgramListProps> = ({
  coachId,
  filters = {},
  sortBy = 'publishedAt',
  sortOrder = 'desc',
  page = 1,
  pageSize = 12,
  onProgramClick,
  onAnalyticsUpdate
}) => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState<LoadingState>({ state: 'idle', error: null });
  const [cache, setCache] = useState<ProgramCache | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate grid layout
  const gridConfig = useMemo(() => {
    if (!containerRef.current) return { columns: 1, width: CARD_MIN_WIDTH };
    const containerWidth = containerRef.current.offsetWidth;
    const columns = Math.max(1, Math.floor((containerWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
    const cardWidth = (containerWidth - (columns - 1) * GRID_GAP) / columns;
    return { columns, width: cardWidth };
  }, [containerRef.current?.offsetWidth]);

  // Virtual scrolling setup
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(totalItems / gridConfig.columns),
    getScrollElement: () => containerRef.current,
    estimateSize: () => 400, // Estimated row height
    overscan: 5
  });

  // Debounced fetch programs
  const fetchPrograms = useCallback(async () => {
    try {
      setLoading({ state: 'loading', error: null });

      // Check cache validity
      if (cache && 
          Date.now() - cache.timestamp < CACHE_TTL &&
          JSON.stringify(cache.filters) === JSON.stringify(filters) &&
          cache.sortBy === sortBy &&
          cache.sortOrder === sortOrder) {
        setPrograms(cache.data);
        setLoading({ state: 'success', error: null });
        return;
      }

      const response = await coachService.getPrograms(
        coachId,
        page,
        pageSize
      );

      if (!response.success) {
        throw response.error;
      }

      const paginatedData = response.data as PaginatedResponse<Program>;
      setPrograms(paginatedData.items);
      setTotalItems(paginatedData.total);

      // Update cache
      setCache({
        data: paginatedData.items,
        timestamp: Date.now(),
        filters,
        sortBy,
        sortOrder
      });

      // Fetch and update analytics
      const analyticsPromises = paginatedData.items.map(program =>
        coachService.getAnalytics(coachId, { programId: program.id })
      );

      const analyticsResponses = await Promise.all(analyticsPromises);
      const updatedPrograms = paginatedData.items.map((program, index) => ({
        ...program,
        analytics: analyticsResponses[index].data.programPerformance.find(p => p.programId === program.id)
      }));

      setPrograms(updatedPrograms);
      setLoading({ state: 'success', error: null });

    } catch (error: any) {
      setLoading({ 
        state: 'error', 
        error: {
          code: error.code || 'FETCH_ERROR',
          message: error.message || 'Failed to fetch programs',
          details: error.details || {}
        }
      });
    }
  }, [coachId, filters, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => rowVirtualizer.measure();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderProgramCard = (program: Program) => (
    <Card
      key={program.id}
      variant="elevated"
      padding="medium"
      className="h-full transition-transform hover:scale-102"
      onClick={() => onProgramClick?.(program)}
      testId={`program-card-${program.id}`}
    >
      <div className="flex flex-col h-full">
        <h3 className="text-xl font-semibold mb-2">{program.title}</h3>
        <p className="text-gray-600 mb-4 line-clamp-2">{program.description}</p>
        
        <div className="flex items-center mb-4">
          <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-sm">
            {program.level}
          </span>
          <span className="ml-2 text-gray-500">
            {program.duration} weeks
          </span>
        </div>

        <div className="flex items-center mb-4">
          <div className="flex items-center">
            <span className="text-2xl font-bold">
              ${program.discountPrice || program.price}
            </span>
            {program.discountPrice && (
              <span className="ml-2 text-gray-400 line-through">
                ${program.price}
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 text-sm text-gray-600">
          <div className="flex items-center">
            <span>⭐ {program.rating.toFixed(1)}</span>
            <span className="ml-1">({program.reviewCount})</span>
          </div>
          <div className="flex items-center justify-end">
            <span>👥 {program.enrollmentCount}</span>
          </div>
        </div>

        {program.analytics && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-500">Completion Rate</p>
                <p className="font-semibold">
                  {(program.analytics.completionRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-gray-500">Revenue</p>
                <p className="font-semibold">
                  ${program.analytics.revenue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  if (loading.state === 'error') {
    return (
      <div className="p-4 bg-red-50 rounded-lg">
        <p className="text-red-600">{loading.error?.message}</p>
        <button
          onClick={fetchPrograms}
          className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
      style={{
        height: '100%',
        width: '100%',
        contain: 'strict'
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const startIndex = virtualRow.index * gridConfig.columns;
          const rowPrograms = programs.slice(startIndex, startIndex + gridConfig.columns);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
              className={classNames(
                'grid gap-6',
                `grid-cols-${gridConfig.columns}`
              )}
            >
              {rowPrograms.map(program => renderProgramCard(program))}
            </div>
          );
        })}
      </div>

      {loading.state === 'loading' && programs.length === 0 && (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="animate-pulse bg-gray-200 rounded-xl h-[400px]"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgramList;