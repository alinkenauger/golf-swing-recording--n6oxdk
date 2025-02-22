import Foundation // v14.0+

@objc public enum MessageType: Int {
    case text
    case video
    case image
    case voice
    case file
    case location
}

@objc public enum MessageStatus: Int {
    case sending
    case sent
    case delivered
    case read
    case failed
    case deleted
}

@objc public class Message: NSObject {
    // MARK: - Properties
    public private(set) var id: String
    public private(set) var threadId: String
    public private(set) var senderId: String
    public private(set) var type: MessageType
    public private(set) var content: String
    public private(set) var status: MessageStatus
    public private(set) var metadata: [String: Any]
    public private(set) var createdAt: Date
    public private(set) var updatedAt: Date
    public private(set) var isEncrypted: Bool
    public private(set) var retryCount: Int
    public private(set) var errorMessage: String?
    public private(set) var isEdited: Bool
    public private(set) var deletedAt: Date?
    
    // MARK: - Thread Safety
    private let lock = NSLock()
    
    // MARK: - Initialization
    public init(id: String, 
                threadId: String, 
                senderId: String, 
                type: MessageType, 
                content: String, 
                metadata: [String: Any]? = nil) throws {
        // Input validation
        guard !id.isEmpty, !threadId.isEmpty, !senderId.isEmpty, !content.isEmpty else {
            throw NSError(domain: "MessageError", 
                         code: 1, 
                         userInfo: [NSLocalizedDescriptionKey: "Invalid input parameters"])
        }
        
        // Initialize properties with thread safety
        self.lock.lock()
        defer { self.lock.unlock() }
        
        self.id = id
        self.threadId = threadId
        self.senderId = senderId
        self.type = type
        self.content = content
        self.status = .sent
        self.metadata = metadata ?? [:]
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isEncrypted = false
        self.retryCount = 0
        self.isEdited = false
        
        super.init()
        
        // Content validation based on type
        try validateContent()
        
        // Set up KVO
        setupObservers()
    }
    
    // MARK: - Public Methods
    public func markAsDelivered() {
        lock.lock()
        defer { lock.unlock() }
        
        guard status == .sent else { return }
        
        status = .delivered
        updatedAt = Date()
        
        // Post notification for UI update
        NotificationCenter.default.post(name: NSNotification.Name("MessageStatusChanged"), 
                                      object: self)
        
        // Log for analytics
        logStatusChange(to: .delivered)
    }
    
    public func markAsRead() {
        lock.lock()
        defer { lock.unlock() }
        
        guard status == .delivered else { return }
        
        status = .read
        updatedAt = Date()
        
        // Post notification for UI update
        NotificationCenter.default.post(name: NSNotification.Name("MessageStatusChanged"), 
                                      object: self)
        
        // Log for analytics
        logStatusChange(to: .read)
    }
    
    // MARK: - Private Methods
    private func validateContent() throws {
        switch type {
        case .video:
            guard content.hasSuffix(".mp4") || content.hasSuffix(".mov") else {
                throw NSError(domain: "MessageError", 
                            code: 2, 
                            userInfo: [NSLocalizedDescriptionKey: "Invalid video format"])
            }
        case .image:
            guard content.hasSuffix(".jpg") || content.hasSuffix(".png") else {
                throw NSError(domain: "MessageError", 
                            code: 3, 
                            userInfo: [NSLocalizedDescriptionKey: "Invalid image format"])
            }
        case .voice:
            guard content.hasSuffix(".m4a") || content.hasSuffix(".wav") else {
                throw NSError(domain: "MessageError", 
                            code: 4, 
                            userInfo: [NSLocalizedDescriptionKey: "Invalid audio format"])
            }
        default:
            break
        }
    }
    
    private func setupObservers() {
        // Add KVO observers for property changes
        addObserver(self, 
                   forKeyPath: #keyPath(status), 
                   options: [.old, .new], 
                   context: nil)
    }
    
    private func logStatusChange(to newStatus: MessageStatus) {
        // Log status change for analytics
        let logData: [String: Any] = [
            "messageId": id,
            "threadId": threadId,
            "oldStatus": status,
            "newStatus": newStatus,
            "timestamp": Date()
        ]
        
        // TODO: Send to analytics service
        print("Status change logged: \(logData)")
    }
    
    // MARK: - KVO
    public override func observeValue(forKeyPath keyPath: String?, 
                                    of object: Any?, 
                                    change: [NSKeyValueChangeKey : Any]?, 
                                    context: UnsafeMutableRawPointer?) {
        if keyPath == #keyPath(status) {
            // Handle status changes
            if let newStatus = change?[.newKey] as? MessageStatus {
                // Trigger UI updates or other necessary actions
                NotificationCenter.default.post(name: NSNotification.Name("MessageStatusChanged"), 
                                             object: self)
            }
        }
    }
    
    // MARK: - Deinitialization
    deinit {
        removeObserver(self, forKeyPath: #keyPath(status))
    }
}