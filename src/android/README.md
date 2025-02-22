# Video Coaching Platform - Android App

Enterprise-grade native Android application for professional sports training with advanced video analysis capabilities. Built with Kotlin and modern Android architecture components.

## Overview

The Video Coaching Platform Android app provides a mobile-first solution for remote sports training, combining sophisticated video analysis tools with secure communication features and monetization capabilities.

### Key Features

- Real-time video recording and processing using CameraX
- Hardware-accelerated video analysis with ML Kit
- Advanced annotation tools with custom rendering
- Secure WebSocket-based messaging
- Stripe payment integration
- Offline support with Room database
- Multi-threaded video processing
- Biometric authentication
- Accessibility support (TalkBack, content descriptions)

## Prerequisites

- Android Studio Hedgehog | 2023.1.1 or newer
- JDK 17
- Kotlin 1.9.0
- Gradle 8.1.0
- Android SDK (min API 24, target API 34)

### Hardware Requirements

- 16GB RAM minimum
- Intel i7/AMD Ryzen 7 or better
- SSD storage recommended
- Android device with API 24+ for testing

## Architecture

The application follows Clean Architecture principles with MVVM pattern:

### Core Components

1. **Presentation Layer**
   - Jetpack Compose UI components
   - ViewModels with state management
   - Navigation with SafeArgs

2. **Domain Layer**
   - Use cases
   - Business models
   - Repository interfaces

3. **Data Layer**
   - Repository implementations
   - Remote/local data sources
   - Data transfer objects (DTOs)

### Key Technologies

- Kotlin Coroutines & Flow for async operations
- Hilt for dependency injection
- Room for local database
- Retrofit with OkHttp for networking
- CameraX for video capture
- MediaCodec for video processing
- WorkManager for background tasks
- Security Crypto for encryption

## Setup Instructions

1. Clone the repository
```bash
git clone https://github.com/your-org/video-coach-android.git
```

2. Configure local.properties
```properties
SENTRY_DSN=your_sentry_dsn
STRIPE_PUBLIC_KEY=your_stripe_key
FIREBASE_CONFIG=your_google_services.json
```

3. Set up signing keys in keystore.properties
```properties
RELEASE_STORE_FILE=release.keystore
RELEASE_STORE_PASSWORD=****
RELEASE_KEY_ALIAS=release
RELEASE_KEY_PASSWORD=****
```

4. Configure Firebase
   - Add google-services.json to app/
   - Enable Crashlytics and Analytics

5. Build and Run
```bash
./gradlew clean build
```

## Development Guidelines

### Code Style

- Follow Kotlin official style guide
- Use ktlint for formatting
- Maximum line length: 120 characters
- Documentation required for public APIs

### Git Workflow

- Feature branches from develop
- Pull request required for merge
- Squash commits when merging
- Branch naming: feature/*, bugfix/*, release/*

### Testing Requirements

- Unit tests: 80% coverage minimum
- Integration tests for Repository layer
- UI tests for critical flows
- Performance tests for video processing

### Performance Requirements

- Video processing: < 60 seconds
- UI thread: 60 FPS
- Memory usage: < 150MB
- Cold start: < 2 seconds
- Network calls: < 3 seconds

## Security Implementation

### Data Protection

- AES-256 encryption for stored data
- TLS 1.3 for network communication
- Certificate pinning
- Biometric authentication
- Proguard optimization

### Security Features

- SafetyNet attestation
- Root detection
- SSL pinning
- Secure key storage
- Anti-tampering checks

## Troubleshooting

### Common Issues

1. Build Failures
   - Clean project and invalidate caches
   - Update Gradle version
   - Check Java version compatibility

2. Performance Issues
   - Enable strict mode in debug
   - Use Android Profiler
   - Check memory leaks with LeakCanary

3. Network Issues
   - Verify network security config
   - Check certificate pinning
   - Enable detailed logging

### Debug Tools

- Sentry for crash reporting
- Firebase Crashlytics
- LeakCanary for memory leaks
- Network inspection tools

## Support

For technical support and documentation:
- Internal Wiki: [link]
- API Documentation: [link]
- Architecture Guide: [link]

## License

Copyright © 2023 Video Coaching Platform. All rights reserved.