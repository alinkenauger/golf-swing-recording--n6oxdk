'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image'; // ^14.0.0
import Link from 'next/link'; // ^14.0.0
import classNames from 'classnames'; // ^2.3.2
import { Button } from '@/components/common/Button';
import { useAuth } from '@/hooks/useAuth';

// Feature section interface
interface FeatureProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  reverse?: boolean;
  animationDelay?: number;
}

const LandingPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  // Handle visibility for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    const sections = document.querySelectorAll('.animate-on-scroll');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Handle CTA click with analytics
  const handleGetStarted = useCallback(() => {
    if (isAuthenticated) {
      window.location.href = user?.role === 'COACH' ? '/coach/dashboard' : '/athlete/dashboard';
    } else {
      window.location.href = '/signup';
    }
  }, [isAuthenticated, user]);

  // Render feature section with accessibility
  const renderFeature = ({ title, description, imageSrc, imageAlt, reverse = false, animationDelay = 0 }: FeatureProps) => (
    <div
      className={classNames(
        'animate-on-scroll grid grid-cols-1 gap-8 py-12 lg:grid-cols-2 lg:gap-16',
        { 'lg:flex-row-reverse': reverse },
        isVisible && 'animate-fade-in'
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex flex-col justify-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-lg text-gray-600">{description}</p>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl shadow-xl">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          priority={animationDelay === 0}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-white antialiased">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded"
      >
        Skip to main content
      </a>

      {/* Hero Section */}
      <section
        id="main-content"
        className="relative overflow-hidden bg-primary-50 py-24 sm:py-32"
        aria-labelledby="hero-heading"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1
              id="hero-heading"
              className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl"
            >
              Transform Your Coaching Business with Video Analysis
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Provide detailed video analysis, real-time feedback, and structured training programs to athletes worldwide while building a scalable online business.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Button
                variant="primary"
                size="lg"
                onClick={handleGetStarted}
                aria-label="Get started with video coaching"
              >
                Get Started
              </Button>
              <Link
                href="/pricing"
                className="text-base font-semibold leading-7 text-gray-900 hover:text-gray-700"
              >
                View Pricing <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        className="py-24 sm:py-32 bg-white scroll-mt-16"
        aria-labelledby="features-heading"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 id="features-heading" className="sr-only">
            Platform Features
          </h2>
          {renderFeature({
            title: "Advanced Video Analysis Tools",
            description: "Provide detailed feedback with real-time annotation tools, voice-over capabilities, and frame-by-frame analysis.",
            imageSrc: "/images/features/video-analysis.jpg",
            imageAlt: "Coach using video analysis tools",
            animationDelay: 0
          })}
          {renderFeature({
            title: "Structured Training Programs",
            description: "Create and monetize comprehensive training programs with progress tracking and personalized feedback.",
            imageSrc: "/images/features/training-programs.jpg",
            imageAlt: "Training program interface",
            reverse: true,
            animationDelay: 200
          })}
          {renderFeature({
            title: "Real-time Communication",
            description: "Stay connected with your athletes through integrated messaging and video response features.",
            imageSrc: "/images/features/communication.jpg",
            imageAlt: "Coach-athlete communication interface",
            animationDelay: 400
          })}
        </div>
      </section>

      {/* CTA Section */}
      <section
        className="relative py-16 sm:py-24 bg-primary-600 scroll-mt-16"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="cta-heading"
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
            >
              Ready to Transform Your Coaching?
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-100">
              Join thousands of coaches already growing their business with our platform.
            </p>
            <div className="mt-10 flex items-center justify-center">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleGetStarted}
                aria-label="Start your coaching journey"
              >
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LandingPage;