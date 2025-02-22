import React, { useMemo, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.2
import { Button } from '../common/Button';
import { PaginatedResponse } from '../../types/common';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  isRTL?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const VISIBLE_PAGES = 5;

const getPageNumbers = (currentPage: number, totalPages: number): number[] => {
  const pages: number[] = [];
  const halfVisible = Math.floor(VISIBLE_PAGES / 2);
  
  let startPage = Math.max(currentPage - halfVisible, 1);
  let endPage = Math.min(startPage + VISIBLE_PAGES - 1, totalPages);
  
  if (endPage - startPage + 1 < VISIBLE_PAGES) {
    startPage = Math.max(endPage - VISIBLE_PAGES + 1, 1);
  }
  
  // Always show first page
  if (startPage > 1) {
    pages.push(1);
    if (startPage > 2) pages.push(-1); // Add ellipsis
  }
  
  // Add pages in range
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }
  
  // Always show last page
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pages.push(-1); // Add ellipsis
    pages.push(totalPages);
  }
  
  return pages;
};

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className,
  isRTL = false,
}) => {
  const pageNumbers = useMemo(() => 
    getPageNumbers(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  }, [totalPages, onPageChange]);

  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    onPageSizeChange?.(Number(event.target.value));
  }, [onPageSizeChange]);

  const startItem = ((currentPage - 1) * pageSize) + 1;
  const endItem = Math.min(startItem + pageSize - 1, totalItems);

  return (
    <nav
      className={classNames(
        'flex items-center justify-between px-4 py-3 sm:px-6',
        className
      )}
      aria-label="Pagination"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Mobile pagination controls */}
      <div className="flex flex-1 justify-between sm:hidden min-h-[44px]">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>

      {/* Desktop pagination controls */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Showing{' '}
            <span className="font-medium">{startItem}</span>
            {' '}to{' '}
            <span className="font-medium">{endItem}</span>
            {' '}of{' '}
            <span className="font-medium">{totalItems}</span>
            {' '}results
          </p>
        </div>

        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          {/* Page size selector */}
          {onPageSizeChange && (
            <select
              className="rounded-md border-gray-300 py-2 text-sm min-h-[44px]
                focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 
                dark:border-gray-600 dark:text-gray-200"
              value={pageSize}
              onChange={handlePageSizeChange}
              aria-label="Select page size"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          )}

          {/* Page number buttons */}
          <div className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-l-md rtl:rounded-l-none rtl:rounded-r-md"
              aria-label="Previous page"
            >
              Previous
            </Button>

            {pageNumbers.map((pageNum, index) => (
              pageNum === -1 ? (
                <span
                  key={`ellipsis-${index}`}
                  className="relative inline-flex items-center px-4 py-2 border 
                    border-gray-300 bg-white text-sm font-medium text-gray-700 
                    min-w-[44px] min-h-[44px] dark:bg-gray-800 dark:border-gray-600 
                    dark:text-gray-200"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  aria-current={pageNum === currentPage ? 'page' : undefined}
                  aria-label={`Page ${pageNum}`}
                  className="min-w-[44px]"
                >
                  {pageNum}
                </Button>
              )
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-r-md rtl:rounded-r-none rtl:rounded-l-md"
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export type { PaginationProps };