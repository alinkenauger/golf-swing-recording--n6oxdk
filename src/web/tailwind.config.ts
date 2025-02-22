import type { Config } from 'tailwindcss/types'; // v3.3.3
import defaultTheme from 'tailwindcss'; // v3.3.3

const config: Config = {
  // Define content sources for Tailwind to scan for classes
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    extend: {
      // Color system with semantic tokens and WCAG 2.1 AA compliant contrast ratios
      colors: {
        primary: {
          DEFAULT: '#2D5BFF', // Brand primary blue
          light: '#5B80FF', // Light variant for hover states
          dark: '#1A3DB2', // Dark variant for active states
        },
        secondary: {
          DEFAULT: '#1A1F36', // Dark blue for text
          light: '#2A324D', // Light variant
          dark: '#0D0F1A', // Dark variant
        },
        success: {
          DEFAULT: '#00B67A', // Success green
          light: '#00E699', // Light variant
          dark: '#008558', // Dark variant
        },
        error: {
          DEFAULT: '#FF4D4D', // Error red
          light: '#FF8080', // Light variant
          dark: '#CC0000', // Dark variant
        },
        // 8 shades of gray for UI elements
        gray: {
          '50': '#F8F9FA',
          '100': '#E9ECEF',
          '200': '#DEE2E6',
          '300': '#CED4DA',
          '400': '#ADB5BD',
          '500': '#6C757D',
          '600': '#495057',
          '700': '#343A40',
          '800': '#212529',
          '900': '#1A1F36',
        },
      },

      // Typography system with SF Pro and Roboto fonts
      fontFamily: {
        sans: ['SF Pro', 'Roboto', 'system-ui', 'sans-serif'],
      },

      // Type scale with appropriate line heights
      fontSize: {
        'xs': ['12px', { lineHeight: '18px' }],
        'sm': ['14px', { lineHeight: '21px' }],
        'base': ['16px', { lineHeight: '24px' }],
        'lg': ['20px', { lineHeight: '30px' }],
        'xl': ['24px', { lineHeight: '36px' }],
        '2xl': ['32px', { lineHeight: '48px' }],
      },

      // 4px-based spacing system
      spacing: {
        '0': '0',
        '1': '4px',   // 4px
        '2': '8px',   // 8px
        '3': '12px',  // 12px
        '4': '16px',  // 16px
        '6': '24px',  // 24px
        '8': '32px',  // 32px
        '12': '48px', // 48px
      },

      // Responsive breakpoints
      screens: {
        'mobile': '320px',  // Mobile devices
        'tablet': '768px',  // Tablet devices
        'desktop': '1024px', // Desktop devices
      },

      // Container configuration with responsive padding
      container: {
        center: true,
        padding: {
          DEFAULT: '16px', // Mobile padding
          tablet: '24px',  // Tablet padding
          desktop: '24px', // Desktop padding
        },
      },
    },
  },

  // Additional plugins for enhanced functionality
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'),
  ],
};

export default config;