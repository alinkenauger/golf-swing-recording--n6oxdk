'use client'

import React from 'react' // ^18.0.0
import { Loading as LoadingSpinner } from '../components/common/Loading'

/**
 * Full-page loading component displayed during Next.js page transitions
 * and data fetching operations. Implements accessible loading indicators
 * following design system specifications.
 */
const Loading: React.FC = () => {
  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-background"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center space-y-4 p-4">
        <LoadingSpinner 
          size="large"
          message="Loading page content..."
          className="motion-safe:animate-spin"
        />
      </div>
    </div>
  )
}

export default Loading