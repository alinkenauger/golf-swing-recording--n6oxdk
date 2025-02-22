import Foundation // v14.0+
import UserNotifications // v14.0+
import Combine // v14.0+

/// Thread-safe singleton helper class managing push notifications and local notifications
/// with support for rich media, interactive responses, and comprehensive error handling
@MainActor
public final class NotificationHelper {
    
    // MARK: - Singleton
    public static let shared = NotificationHelper()
    
    // MARK: - Properties
    private let notificationCenter: UNUserNotificationCenter
    public let notificationReceived = PassthroughSubject<UNNotification, Never>()
    public let notificationResponse = PassthroughSubject<UNNotificationResponse, Never>()
    public let notificationSettings = CurrentValueSubject<NotificationSettings, Never>(.init())
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Constants
    private let notificationCategories: Set<UNNotificationCategory> = [
        UNNotificationCategory(
            identifier: "message",
            actions: [
                UNNotificationAction(identifier: "reply", title: "Reply", options: .foreground),
                UNNotificationAction(identifier: "mark_read", title: "Mark as Read", options: .authenticationRequired)
            ],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "New Message",
            options: [.customDismissAction, .allowAnnouncement]
        ),
        UNNotificationCategory(
            identifier: "video_review",
            actions: [
                UNNotificationAction(identifier: "view", title: "View", options: .foreground),
                UNNotificationAction(identifier: "later", title: "Remind Later", options: .authenticationRequired)
            ],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "New Video Review",
            options: [.customDismissAction, .allowAnnouncement]
        )
    ]
    
    private let notificationSoundName = UNNotificationSoundName("notification.wav")
    
    // MARK: - Initialization
    private init() {
        self.notificationCenter = UNUserNotificationCenter.current()
        setupNotificationHandling()
        configureCategories()
        registerForRemoteNotifications()
    }
    
    // MARK: - Setup
    private func setupNotificationHandling() {
        notificationCenter.delegate = self
        
        // Observe notification settings changes
        notificationCenter.getNotificationSettings { [weak self] settings in
            guard let self = self else { return }
            let notificationSettings = NotificationSettings(
                authorizationStatus: settings.authorizationStatus,
                soundEnabled: settings.soundSetting == .enabled,
                badgeEnabled: settings.badgeSetting == .enabled,
                alertEnabled: settings.alertSetting == .enabled,
                notificationCenterEnabled: settings.notificationCenterSetting == .enabled,
                lockScreenEnabled: settings.lockScreenSetting == .enabled,
                criticalAlertEnabled: settings.criticalAlertSetting == .enabled
            )
            Task { @MainActor in
                self.notificationSettings.send(notificationSettings)
            }
        }
    }
    
    private func configureCategories() {
        notificationCenter.setNotificationCategories(notificationCategories)
    }
    
    private func registerForRemoteNotifications() {
        Task { @MainActor in
            try? await UIApplication.shared.registerForRemoteNotifications()
        }
    }
    
    // MARK: - Public Methods
    /// Requests notification permissions from user with proper error handling and settings persistence
    public func requestAuthorization(options: UNAuthorizationOptions = [.alert, .badge, .sound, .criticalAlert]) -> AnyPublisher<Bool, Error> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NotificationError.instanceDeallocated))
                return
            }
            
            self.notificationCenter.requestAuthorization(options: options) { granted, error in
                if let error = error {
                    promise(.failure(error))
                    return
                }
                
                Task { @MainActor in
                    // Update settings after authorization
                    self.notificationCenter.getNotificationSettings { settings in
                        let newSettings = NotificationSettings(
                            authorizationStatus: settings.authorizationStatus,
                            soundEnabled: settings.soundSetting == .enabled,
                            badgeEnabled: settings.badgeSetting == .enabled,
                            alertEnabled: settings.alertSetting == .enabled,
                            notificationCenterEnabled: settings.notificationCenterSetting == .enabled,
                            lockScreenEnabled: settings.lockScreenSetting == .enabled,
                            criticalAlertEnabled: settings.criticalAlertSetting == .enabled
                        )
                        self.notificationSettings.send(newSettings)
                    }
                }
                
                promise(.success(granted))
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Schedules a local notification with rich media support and delivery confirmation
    public func scheduleNotification(
        title: String,
        body: String,
        categoryIdentifier: String? = nil,
        mediaURL: URL? = nil,
        userInfo: [String: Any]? = nil
    ) -> AnyPublisher<Void, Error> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NotificationError.instanceDeallocated))
                return
            }
            
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = UNNotificationSound(named: self.notificationSoundName)
            
            if let categoryIdentifier = categoryIdentifier {
                content.categoryIdentifier = categoryIdentifier
            }
            
            if let userInfo = userInfo {
                content.userInfo = userInfo
            }
            
            // Add media attachment if provided
            if let mediaURL = mediaURL {
                do {
                    let attachment = try UNNotificationAttachment(
                        identifier: UUID().uuidString,
                        url: mediaURL,
                        options: nil
                    )
                    content.attachments = [attachment]
                } catch {
                    promise(.failure(NotificationError.attachmentFailed(error)))
                    return
                }
            }
            
            // Configure trigger
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            
            // Create request
            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: trigger
            )
            
            // Schedule notification
            self.notificationCenter.add(request) { error in
                if let error = error {
                    promise(.failure(error))
                } else {
                    promise(.success(()))
                }
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Processes incoming push notifications with payload validation and error handling
    public func handlePushNotification(_ userInfo: [AnyHashable: Any]) {
        guard let messageType = userInfo["type"] as? String else {
            Logger.error("Invalid notification payload: missing type")
            return
        }
        
        // Parse notification data based on message type
        switch messageType {
        case "message":
            handleMessageNotification(userInfo)
        case "video_review":
            handleVideoReviewNotification(userInfo)
        default:
            Logger.warning("Unknown notification type: \(messageType)")
        }
    }
    
    /// Removes all delivered notifications and cancels pending ones
    public func clearNotifications() {
        notificationCenter.removeAllDeliveredNotifications()
        notificationCenter.removeAllPendingNotificationRequests()
        
        Task { @MainActor in
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }
    
    // MARK: - Private Methods
    private func handleMessageNotification(_ userInfo: [AnyHashable: Any]) {
        guard let messageData = userInfo["message"] as? [String: Any],
              let messageId = messageData["id"] as? String,
              let senderId = messageData["sender_id"] as? String,
              let content = messageData["content"] as? String else {
            Logger.error("Invalid message notification payload")
            return
        }
        
        // Create message payload
        let payload = MessagePayload(
            id: messageId,
            senderId: senderId,
            content: content,
            type: .init(rawValue: messageData["type"] as? Int ?? 0) ?? .text
        )
        
        // Emit notification event
        notificationReceived.send(.init(payload: payload))
    }
    
    private func handleVideoReviewNotification(_ userInfo: [AnyHashable: Any]) {
        guard let reviewData = userInfo["review"] as? [String: Any],
              let reviewId = reviewData["id"] as? String,
              let coachId = reviewData["coach_id"] as? String,
              let videoUrl = reviewData["video_url"] as? String else {
            Logger.error("Invalid video review notification payload")
            return
        }
        
        // Process video review notification
        // Implementation specific to video review handling
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension NotificationHelper: UNUserNotificationCenterDelegate {
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        notificationReceived.send(notification)
        return [.banner, .sound, .badge, .list]
    }
    
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        notificationResponse.send(response)
        
        // Handle notification actions
        switch response.actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            // Handle default action (notification tapped)
            break
        case UNNotificationDismissActionIdentifier:
            // Handle dismiss action
            break
        case "reply":
            if let textResponse = response as? UNTextInputNotificationResponse {
                handleReplyAction(textResponse.userText, response.notification)
            }
        case "mark_read":
            handleMarkReadAction(response.notification)
        case "view":
            handleViewAction(response.notification)
        case "later":
            handleRemindLaterAction(response.notification)
        default:
            break
        }
    }
    
    private func handleReplyAction(_ text: String, _ notification: UNNotification) {
        // Implementation for reply action
    }
    
    private func handleMarkReadAction(_ notification: UNNotification) {
        // Implementation for mark as read action
    }
    
    private func handleViewAction(_ notification: UNNotification) {
        // Implementation for view action
    }
    
    private func handleRemindLaterAction(_ notification: UNNotification) {
        // Implementation for remind later action
    }
}

// MARK: - NotificationSettings
public struct NotificationSettings {
    public let authorizationStatus: UNAuthorizationStatus
    public let soundEnabled: Bool
    public let badgeEnabled: Bool
    public let alertEnabled: Bool
    public let notificationCenterEnabled: Bool
    public let lockScreenEnabled: Bool
    public let criticalAlertEnabled: Bool
    
    init(
        authorizationStatus: UNAuthorizationStatus = .notDetermined,
        soundEnabled: Bool = false,
        badgeEnabled: Bool = false,
        alertEnabled: Bool = false,
        notificationCenterEnabled: Bool = false,
        lockScreenEnabled: Bool = false,
        criticalAlertEnabled: Bool = false
    ) {
        self.authorizationStatus = authorizationStatus
        self.soundEnabled = soundEnabled
        self.badgeEnabled = badgeEnabled
        self.alertEnabled = alertEnabled
        self.notificationCenterEnabled = notificationCenterEnabled
        self.lockScreenEnabled = lockScreenEnabled
        self.criticalAlertEnabled = criticalAlertEnabled
    }
}

// MARK: - NotificationError
private enum NotificationError: LocalizedError {
    case instanceDeallocated
    case attachmentFailed(Error)
    
    var errorDescription: String? {
        switch self {
        case .instanceDeallocated:
            return "Notification helper instance was deallocated"
        case .attachmentFailed(let error):
            return "Failed to attach media to notification: \(error.localizedDescription)"
        }
    }
}

// MARK: - Logger
private enum Logger {
    static func error(_ message: String) {
        print("❌ [NotificationHelper] \(message)")
    }
    
    static func warning(_ message: String) {
        print("⚠️ [NotificationHelper] \(message)")
    }
}