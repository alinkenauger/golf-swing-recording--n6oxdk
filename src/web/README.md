# Video Coaching Platform Web Application

A comprehensive Next.js-based web application for video coaching and analysis, featuring real-time annotations, video processing, and interactive training capabilities.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development](#development)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js >= 18.0.0
- Yarn package manager
- Supported browsers:
  - Chrome >= 60
  - Firefox >= 60
  - Safari >= 12
  - Edge >= 79

## Getting Started

1. Clone the repository
2. Install dependencies:
```bash
yarn install
```

3. Configure environment variables:
```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_AUTH0_DOMAIN=
NEXT_PUBLIC_AUTH0_CLIENT_ID=
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=
NEXT_PUBLIC_SENTRY_DSN=
```

4. Start development server:
```bash
yarn dev
```

## Development

### Available Scripts

- `yarn dev` - Start development server with hot reloading
- `yarn build` - Create optimized production build
- `yarn start` - Start production server
- `yarn lint` - Run ESLint and Prettier checks
- `yarn lint:fix` - Fix linting issues automatically
- `yarn test` - Run Jest tests
- `yarn test:watch` - Run tests in watch mode
- `yarn test:coverage` - Generate test coverage report
- `yarn cypress` - Open Cypress test runner
- `yarn cypress:headless` - Run Cypress tests headlessly
- `yarn type-check` - Run TypeScript type checking
- `yarn format` - Format code with Prettier

### Project Structure

```
src/
├── components/       # Reusable React components
├── constants/       # Application constants and config
├── hooks/          # Custom React hooks
├── pages/          # Next.js pages and API routes
├── services/       # API and external service integrations
├── store/          # Redux store configuration
├── styles/         # Global styles and Tailwind config
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

### Core Dependencies

- Next.js v14.0.0 - React framework
- React v18.0.0 - UI library
- Redux Toolkit v2.0.0 - State management
- Socket.io-client v4.7.2 - Real-time communication
- Auth0 SDK v2.0.0 - Authentication
- Stripe SDK v2.1.0 - Payment processing
- Tailwind CSS v3.3.0 - Styling

## Architecture

### State Management

- Redux Toolkit for global state
- React Query for server state
- Local storage for persistence
- WebSocket for real-time updates

### Performance Optimization

- Image optimization via Next.js Image
- Code splitting and lazy loading
- Service Worker with next-pwa
- CDN integration for static assets
- Bundle size optimization

### API Integration

- Axios for HTTP requests
- Socket.io for real-time features
- Retry mechanism for failed requests
- Request caching strategy
- Error boundary implementation

## Testing

### Unit Testing

- Jest and React Testing Library
- Component testing guidelines
- Mock service worker for API testing
- Coverage threshold: 80%

### E2E Testing

- Cypress for end-to-end testing
- Accessibility testing with cypress-axe
- Visual regression testing
- Performance testing metrics

## Deployment

### Build Process

1. Run type checking:
```bash
yarn type-check
```

2. Run tests:
```bash
yarn test
```

3. Create production build:
```bash
yarn build
```

4. Start production server:
```bash
yarn start
```

### Performance Monitoring

- Prometheus metrics integration
- Grafana dashboards
- Real User Monitoring (RUM)
- Error tracking with Sentry
- Performance budget enforcement

## Security

### Authentication

- Auth0 integration
- JWT token management
- Secure session handling
- MFA support

### Data Protection

- HTTPS enforcement
- CSP configuration
- XSS prevention
- CSRF protection
- Input sanitization

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Clear `.next` directory
   - Remove `node_modules` and reinstall
   - Check Node.js version

2. **Performance Issues**
   - Enable bundle analysis
   - Check for memory leaks
   - Monitor network requests
   - Optimize image loading

3. **API Connection Issues**
   - Verify environment variables
   - Check CORS configuration
   - Validate API endpoints
   - Monitor WebSocket connection

### Debug Tools

- Redux DevTools
- React Developer Tools
- Network tab monitoring
- Performance profiling
- Memory snapshot analysis

## Contributing

1. Follow TypeScript guidelines
2. Maintain test coverage
3. Document new features
4. Follow Git commit conventions
5. Submit PRs against develop branch

## License

Copyright © 2023 Video Coaching Platform. All rights reserved.