import Foundation

// MARK: - User Role Enumeration
public enum UserRole: String, Codable, CaseIterable {
    case coach
    case athlete
}

// MARK: - User Error Types
public enum UserError: Error {
    case invalidEmail
    case invalidName
    case invalidProfile
}

// MARK: - User Protocol
public protocol UserProtocol: AnyObject {
    var id: String { get }
    var email: String { get }
    var firstName: String { get }
    var lastName: String { get }
    var bio: String? { get }
    var avatarUrl: URL? { get }
    var role: UserRole { get }
    var fullName: String { get }
    var isCoach: Bool { get }
    
    func updateProfile(firstName: String?, lastName: String?, bio: String?, avatarUrl: URL?) -> Result<Void, UserError>
}

// MARK: - User Implementation
@available(iOS 14.0, *)
@objc public class User: NSObject {
    // MARK: - Properties
    public private(set) let id: String
    public private(set) let email: String
    public private(set) var firstName: String
    public private(set) var lastName: String
    public private(set) var bio: String?
    public private(set) var avatarUrl: URL?
    public private(set) let role: UserRole
    public private(set) let createdAt: Date
    public private(set) var updatedAt: Date
    
    // Serial queue for thread-safe property access
    private let queue: DispatchQueue
    
    // MARK: - Email Validation
    private static let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
    private static let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
    
    // MARK: - Initialization
    public init(id: String,
                email: String,
                firstName: String,
                lastName: String,
                bio: String? = nil,
                avatarUrl: URL? = nil,
                role: UserRole,
                createdAt: Date = Date(),
                updatedAt: Date = Date()) throws {
        
        // Validate email format
        guard User.emailPredicate.evaluate(with: email) else {
            throw UserError.invalidEmail
        }
        
        // Validate name fields
        guard !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw UserError.invalidName
        }
        
        // Initialize properties
        self.id = id
        self.email = email
        self.firstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        self.lastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        self.bio = bio?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.avatarUrl = avatarUrl
        self.role = role
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        
        // Initialize serial queue for thread safety
        self.queue = DispatchQueue(label: "com.videocoach.user.\(id)", qos: .userInitiated)
        
        super.init()
    }
}

// MARK: - Computed Properties
extension User {
    public var fullName: String {
        queue.sync {
            return "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }
    
    public var isCoach: Bool {
        queue.sync {
            return role == .coach
        }
    }
}

// MARK: - Profile Management
extension User {
    public func updateProfile(firstName: String? = nil,
                            lastName: String? = nil,
                            bio: String? = nil,
                            avatarUrl: URL? = nil) -> Result<Void, UserError> {
        
        return queue.sync {
            // Validate firstName if provided
            if let firstName = firstName {
                guard !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    return .failure(.invalidName)
                }
            }
            
            // Validate lastName if provided
            if let lastName = lastName {
                guard !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    return .failure(.invalidName)
                }
            }
            
            // Validate bio length if provided
            if let bio = bio {
                guard bio.count <= 500 else {
                    return .failure(.invalidProfile)
                }
            }
            
            // Update properties
            if let firstName = firstName {
                self.firstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            
            if let lastName = lastName {
                self.lastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            
            if let bio = bio {
                self.bio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            
            if let avatarUrl = avatarUrl {
                self.avatarUrl = avatarUrl
            }
            
            // Update timestamp
            self.updatedAt = Date()
            
            return .success(())
        }
    }
}

// MARK: - Codable Conformance
extension User: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, email, firstName, lastName, bio, avatarUrl, role, createdAt, updatedAt
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try queue.sync {
            try container.encode(id, forKey: .id)
            try container.encode(email, forKey: .email)
            try container.encode(firstName, forKey: .firstName)
            try container.encode(lastName, forKey: .lastName)
            try container.encodeIfPresent(bio, forKey: .bio)
            try container.encodeIfPresent(avatarUrl, forKey: .avatarUrl)
            try container.encode(role, forKey: .role)
            try container.encode(createdAt, forKey: .createdAt)
            try container.encode(updatedAt, forKey: .updatedAt)
        }
    }
}

// MARK: - Equatable Conformance
extension User: Equatable {
    public static func == (lhs: User, rhs: User) -> Bool {
        return lhs.id == rhs.id
    }
}

// MARK: - Identifiable Conformance
extension User: Identifiable {}