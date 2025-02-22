import AVFoundation
import Photos
import UserNotifications
import Combine

/// Represents possible permission-related errors
enum PermissionError: Error {
    case denied(String)
    case restricted(String)
    case unknown(String)
    case notDetermined
}

/// Represents the current status of a permission request
enum PermissionStatus {
    case authorized
    case denied
    case restricted
    case notDetermined
}

/// Thread-safe singleton class managing system permissions with caching and comprehensive error handling
@MainActor
final class PermissionManager {
    // MARK: - Singleton Instance
    
    static let shared = PermissionManager()
    
    // MARK: - Private Properties
    
    private var cameraAuthStatus: AVAuthorizationStatus
    private var microphoneAuthStatus: AVAuthorizationStatus
    private var photoLibraryAuthStatus: PHAuthorizationStatus
    private var notificationAuthStatus: UNAuthorizationStatus
    
    private let permissionStatusSubject = PassthroughSubject<PermissionStatus, Never>()
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        // Initialize authorization statuses
        self.cameraAuthStatus = AVCaptureDevice.authorizationStatus(for: .video)
        self.microphoneAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        self.photoLibraryAuthStatus = PHPhotoLibrary.authorizationStatus()
        
        // Initialize notification status
        var notificationStatus: UNAuthorizationStatus = .notDetermined
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            notificationStatus = settings.authorizationStatus
        }
        self.notificationAuthStatus = notificationStatus
        
        // Setup status change observation
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                self?.refreshAuthorizationStatuses()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Public Methods
    
    /// Requests camera access permission
    /// - Returns: A publisher emitting the permission result or error
    func requestCameraAccess() -> AnyPublisher<Bool, PermissionError> {
        return Future<Bool, PermissionError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("PermissionManager instance deallocated")))
                return
            }
            
            switch self.cameraAuthStatus {
            case .authorized:
                promise(.success(true))
            case .denied:
                promise(.failure(.denied("Camera access denied")))
            case .restricted:
                promise(.failure(.restricted("Camera access restricted")))
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    Task { @MainActor in
                        self.cameraAuthStatus = granted ? .authorized : .denied
                        promise(.success(granted))
                    }
                }
            @unknown default:
                promise(.failure(.unknown("Unknown camera authorization status")))
            }
        }.eraseToAnyPublisher()
    }
    
    /// Requests microphone access permission
    /// - Returns: A publisher emitting the permission result or error
    func requestMicrophoneAccess() -> AnyPublisher<Bool, PermissionError> {
        return Future<Bool, PermissionError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("PermissionManager instance deallocated")))
                return
            }
            
            switch self.microphoneAuthStatus {
            case .authorized:
                promise(.success(true))
            case .denied:
                promise(.failure(.denied("Microphone access denied")))
            case .restricted:
                promise(.failure(.restricted("Microphone access restricted")))
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    Task { @MainActor in
                        self.microphoneAuthStatus = granted ? .authorized : .denied
                        promise(.success(granted))
                    }
                }
            @unknown default:
                promise(.failure(.unknown("Unknown microphone authorization status")))
            }
        }.eraseToAnyPublisher()
    }
    
    /// Requests photo library access permission
    /// - Returns: A publisher emitting the permission result or error
    func requestPhotoLibraryAccess() -> AnyPublisher<Bool, PermissionError> {
        return Future<Bool, PermissionError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("PermissionManager instance deallocated")))
                return
            }
            
            switch self.photoLibraryAuthStatus {
            case .authorized, .limited:
                promise(.success(true))
            case .denied:
                promise(.failure(.denied("Photo library access denied")))
            case .restricted:
                promise(.failure(.restricted("Photo library access restricted")))
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization { status in
                    Task { @MainActor in
                        self.photoLibraryAuthStatus = status
                        promise(.success(status == .authorized || status == .limited))
                    }
                }
            @unknown default:
                promise(.failure(.unknown("Unknown photo library authorization status")))
            }
        }.eraseToAnyPublisher()
    }
    
    /// Requests notification permission with specified options
    /// - Parameter options: The notification authorization options to request
    /// - Returns: A publisher emitting the permission result or error
    func requestNotificationAccess(options: UNAuthorizationOptions = [.alert, .sound, .badge]) -> AnyPublisher<Bool, PermissionError> {
        return Future<Bool, PermissionError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("PermissionManager instance deallocated")))
                return
            }
            
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                Task { @MainActor in
                    switch settings.authorizationStatus {
                    case .authorized, .provisional:
                        promise(.success(true))
                    case .denied:
                        promise(.failure(.denied("Notification access denied")))
                    case .notDetermined:
                        UNUserNotificationCenter.current().requestAuthorization(options: options) { granted, error in
                            Task { @MainActor in
                                if let error = error {
                                    promise(.failure(.unknown(error.localizedDescription)))
                                } else {
                                    self.notificationAuthStatus = granted ? .authorized : .denied
                                    promise(.success(granted))
                                }
                            }
                        }
                    case .ephemeral:
                        promise(.success(true))
                    @unknown default:
                        promise(.failure(.unknown("Unknown notification authorization status")))
                    }
                }
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func refreshAuthorizationStatuses() {
        self.cameraAuthStatus = AVCaptureDevice.authorizationStatus(for: .video)
        self.microphoneAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        self.photoLibraryAuthStatus = PHPhotoLibrary.authorizationStatus()
        
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            Task { @MainActor in
                self?.notificationAuthStatus = settings.authorizationStatus
            }
        }
    }
}