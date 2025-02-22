'use client';

import { Inter } from 'next/font/google'; // ^14.0.0
import { Provider } from 'react-redux'; // ^8.1.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { store } from '../store';

// Initialize Inter font with performance optimizations
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'sans-serif']
});

// Metadata configuration for SEO and device optimization
export const metadata = {
  title: 'Video Coaching Platform - Professional Video Analysis and Remote Coaching',
  description: 'Advanced video analysis and remote coaching platform for professional sports training and development',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
  themeColor: '#2D5BFF',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
};

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-md">
    <h2 className="text-red-800 font-semibold mb-2">Something went wrong:</h2>
    <pre className="text-sm text-red-600 mb-4">{error.message}</pre>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
    >
      Try again
    </button>
  </div>
);

// Root layout component with comprehensive error handling and accessibility features
const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <meta charSet="utf-8" />
        <meta name="color-scheme" content="light dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className="min-h-screen flex flex-col bg-white dark:bg-gray-900">
        <Provider store={store}>
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => {
              // Reset error state and reload necessary data
              window.location.reload();
            }}
          >
            {/* Skip navigation link for keyboard users */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-primary-600 text-white px-4 py-2 rounded"
            >
              Skip to main content
            </a>

            {/* Main navigation header */}
            <Header className="fixed top-0 w-full z-40" />

            {/* Main content area with proper spacing for fixed header */}
            <main
              id="main-content"
              className="flex-grow pt-16 relative"
              role="main"
              aria-label="Main content"
            >
              {children}
            </main>

            {/* Footer with accessibility features */}
            <Footer className="mt-auto" />
          </ErrorBoundary>
        </Provider>

        {/* Script for theme handling to prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </body>
    </html>
  );
};

export default RootLayout;