// PostCSS Configuration v10.4.0
// Integrates with Tailwind CSS v3.3.0 for design system implementation
// Supports WCAG 2.1 Level AA compliance through proper CSS processing

module.exports = {
  // Core plugins for CSS processing pipeline
  plugins: [
    // Tailwind CSS for utility-first styling and design system implementation
    // Processes design tokens defined in tailwind.config.ts including:
    // - Typography: SF Pro, Roboto fonts
    // - Colors: Primary (#2D5BFF), Secondary (#1A1F36), etc.
    // - Spacing: 4/8/12/16/24/32/48px scale
    // - Breakpoints: Mobile (320px), Tablet (768px), Desktop (1024px)
    'tailwindcss',

    // Autoprefixer for cross-browser compatibility
    // Automatically adds vendor prefixes to CSS rules
    // Ensures consistent rendering across different browsers
    'autoprefixer',
  ],

  // Enable source maps for development environment
  // Helps with debugging by mapping processed CSS back to source files
  sourceMap: process.env.NODE_ENV === 'development',
};