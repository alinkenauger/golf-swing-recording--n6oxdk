'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../components/common/Button';

const NotFound: React.FC = () => {
  const router = useRouter();

  return (
    <>
      {/* Add metadata for SEO and accessibility */}
      <head>
        <title>Page Not Found - Video Coaching Platform</title>
        <meta 
          name="description" 
          content="The page you're looking for doesn't exist. Return to home or explore our coaching content."
        />
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>

      {/* Main container with responsive layout */}
      <main 
        className="min-h-[calc(100vh-16rem)] flex flex-col items-center justify-center px-4 bg-white"
        role="main"
      >
        <div className="max-w-md mx-auto text-center space-y-8">
          {/* Error illustration */}
          <div className="mb-8">
            <img
              src="/images/404-illustration.svg"
              alt="Page not found illustration"
              width={320}
              height={320}
              className="mx-auto"
            />
          </div>

          {/* Error message with design system typography */}
          <h1 className="text-4xl font-bold text-[#1A1F36] mb-4 font-sf-pro">
            Page Not Found
          </h1>

          {/* Descriptive text with proper contrast */}
          <p className="text-lg text-gray-600 mb-8 font-sf-pro">
            The page you're looking for doesn't exist or has been moved. 
            Please check the URL or navigate back to explore our coaching content.
          </p>

          {/* Navigation buttons with proper spacing and touch targets */}
          <div className="space-x-4 flex justify-center items-center">
            <Button
              variant="primary"
              size="lg"
              onClick={() => router.push('/')}
              className="bg-[#2D5BFF] hover:bg-[#2D5BFF]/90"
              aria-label="Return to home page"
            >
              Return Home
            </Button>

            <Link href="/coaches" passHref>
              <Button
                variant="outline"
                size="lg"
                className="border-[#2D5BFF] text-[#2D5BFF]"
                aria-label="Browse coaching content"
              >
                Browse Coaches
              </Button>
            </Link>
          </div>

          {/* Additional help text */}
          <p className="text-sm text-gray-500 mt-8">
            Need help? {' '}
            <Link 
              href="/support"
              className="text-[#2D5BFF] hover:underline focus:outline-none focus:ring-2 focus:ring-[#2D5BFF] focus:ring-offset-2"
            >
              Contact our support team
            </Link>
          </p>
        </div>
      </main>
    </>
  );
};

export default NotFound;