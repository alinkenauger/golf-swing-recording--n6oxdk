import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatDate } from 'date-fns'; // v2.30.0
import { useTranslation } from 'react-i18next'; // v13.0.0
import type { Payment } from '../../types/payment';
import { PaymentService } from '../../services/payment.service';
import { Pagination } from '../common/Pagination';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Loading } from '../common/Loading';

type SortDirection = 'asc' | 'desc';

interface PaymentFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

interface PaymentHistoryProps {
  userId: string;
  pageSize?: number;
  onError?: (error: Error) => void;
}

interface PaymentHistoryState {
  payments: Payment[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  isLoading: boolean;
  error: string | null;
  sortField: string;
  sortDirection: SortDirection;
  filters: PaymentFilters;
}

const DEFAULT_PAGE_SIZE = 10;

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  userId,
  pageSize = DEFAULT_PAGE_SIZE,
  onError
}) => {
  const { t } = useTranslation();
  const paymentService = new PaymentService(null, null, { retries: 3 });

  const [state, setState] = useState<PaymentHistoryState>({
    payments: [],
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    isLoading: true,
    error: null,
    sortField: 'createdAt',
    sortDirection: 'desc',
    filters: {}
  });

  const fetchPaymentHistory = useCallback(async (
    page: number,
    filters: PaymentFilters,
    sort: { field: string; direction: SortDirection }
  ) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await paymentService.getPaymentHistory({
        userId,
        page,
        pageSize,
        filters,
        sort
      });

      setState(prev => ({
        ...prev,
        payments: response.items,
        currentPage: response.page,
        totalPages: response.totalPages,
        totalItems: response.total,
        isLoading: false
      }));

      // Announce update to screen readers
      const statusMessage = t('payments.historyUpdated', {
        count: response.items.length,
        total: response.total
      });
      announceToScreenReader(statusMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage, isLoading: false }));
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [userId, pageSize, onError, t]);

  useEffect(() => {
    fetchPaymentHistory(
      state.currentPage,
      state.filters,
      { field: state.sortField, direction: state.sortDirection }
    );
  }, [state.currentPage, state.filters, state.sortField, state.sortDirection]);

  const handleSort = useCallback((field: string) => {
    setState(prev => {
      const direction = prev.sortField === field && prev.sortDirection === 'asc' ? 'desc' : 'asc';
      return {
        ...prev,
        sortField: field,
        sortDirection: direction,
        currentPage: 1
      };
    });
  }, []);

  const handleFilter = useCallback((newFilters: PaymentFilters) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters },
      currentPage: 1
    }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setState(prev => ({ ...prev, currentPage: page }));
  }, []);

  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.setAttribute('class', 'sr-only');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  const renderSortIcon = (field: string) => {
    if (state.sortField !== field) return null;
    return (
      <span className="ml-2" aria-hidden="true">
        {state.sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const renderPaymentStatus = (status: string) => {
    const statusClasses = {
      SUCCESS: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      REFUNDED: 'bg-gray-100 text-gray-800'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-sm ${statusClasses[status] || ''}`}>
        {t(`payments.status.${status.toLowerCase()}`)}
      </span>
    );
  };

  if (state.error) {
    return (
      <div role="alert" className="text-red-600 p-4 border border-red-200 rounded">
        {state.error}
      </div>
    );
  }

  return (
    <ErrorBoundary onError={onError}>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold mb-4">
          {t('payments.history.title')}
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <input
            type="date"
            aria-label={t('payments.filters.startDate')}
            onChange={(e) => handleFilter({ startDate: e.target.value })}
            className="rounded border-gray-300 focus:border-primary-500 focus:ring-primary-500"
          />
          <input
            type="date"
            aria-label={t('payments.filters.endDate')}
            onChange={(e) => handleFilter({ endDate: e.target.value })}
            className="rounded border-gray-300 focus:border-primary-500 focus:ring-primary-500"
          />
          <select
            aria-label={t('payments.filters.status')}
            onChange={(e) => handleFilter({ status: e.target.value })}
            className="rounded border-gray-300 focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">{t('payments.filters.allStatuses')}</option>
            <option value="SUCCESS">{t('payments.status.success')}</option>
            <option value="FAILED">{t('payments.status.failed')}</option>
            <option value="PENDING">{t('payments.status.pending')}</option>
            <option value="REFUNDED">{t('payments.status.refunded')}</option>
          </select>
        </div>

        {state.isLoading ? (
          <Loading size="large" message={t('payments.loading')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('createdAt')}
                        className="flex items-center focus:outline-none focus:underline"
                      >
                        {t('payments.date')}
                        {renderSortIcon('createdAt')}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('amount')}
                        className="flex items-center focus:outline-none focus:underline"
                      >
                        {t('payments.amount')}
                        {renderSortIcon('amount')}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.status')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.transactionId')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {state.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(new Date(payment.createdAt), 'PPP')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Intl.NumberFormat(undefined, {
                          style: 'currency',
                          currency: payment.currency
                        }).format(payment.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderPaymentStatus(payment.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                        {payment.transactionId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={state.currentPage}
              totalPages={state.totalPages}
              pageSize={pageSize}
              totalItems={state.totalItems}
              onPageChange={handlePageChange}
              className="mt-4"
            />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};