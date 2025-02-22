import Foundation  // iOS 14.0+
import Security   // iOS 14.0+
import LocalAuthentication  // iOS 14.0+

/// Comprehensive error types for Keychain operations
enum KeychainError: Error, LocalizedError {
    case itemNotFound
    case duplicateItem
    case authenticationFailed
    case biometricNotAvailable
    case iCloudSyncFailed
    case encryptionFailed
    case unexpectedStatus(OSStatus)
    case invalidData
    
    var errorDescription: String? {
        switch self {
        case .itemNotFound:
            return "The specified item was not found in the keychain."
        case .duplicateItem:
            return "An item with the specified identifier already exists."
        case .authenticationFailed:
            return "Biometric authentication failed."
        case .biometricNotAvailable:
            return "Biometric authentication is not available on this device."
        case .iCloudSyncFailed:
            return "Failed to synchronize with iCloud Keychain."
        case .encryptionFailed:
            return "Failed to encrypt or decrypt the data."
        case .unexpectedStatus(let status):
            return "Unexpected keychain error: \(status)"
        case .invalidData:
            return "The data is invalid or corrupted."
        }
    }
}

/// Defines accessibility options for keychain items
enum KeychainAccessibility {
    case whenUnlocked
    case afterFirstUnlock
    case whenPasscodeSetThisDeviceOnly
    case whenUnlockedThisDeviceOnly
    case afterFirstUnlockThisDeviceOnly
    
    var secAccessibility: CFString {
        switch self {
        case .whenUnlocked:
            return kSecAttrAccessibleWhenUnlocked
        case .afterFirstUnlock:
            return kSecAttrAccessibleAfterFirstUnlock
        case .whenPasscodeSetThisDeviceOnly:
            return kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
        case .whenUnlockedThisDeviceOnly:
            return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        case .afterFirstUnlockThisDeviceOnly:
            return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
    }
}

/// A thread-safe singleton class providing secure interface to iOS Keychain Services
@available(iOS 14.0, *)
final class KeychainHelper {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    static let shared = KeychainHelper()
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Access group for keychain sharing
    private let accessGroup: String?
    
    /// iCloud synchronization flag
    private let synchronizable: Bool
    
    /// Local Authentication context for biometric operations
    private var context: LAContext?
    
    // MARK: - Initialization
    
    private init() {
        self.queue = DispatchQueue(label: "com.videocoach.keychain", qos: .userInitiated)
        self.accessGroup = Bundle.main.bundleIdentifier
        self.synchronizable = true
        self.context = LAContext()
    }
    
    // MARK: - Public Methods
    
    /// Saves data securely to the keychain
    /// - Parameters:
    ///   - data: The data to be stored
    ///   - service: Service identifier for the keychain item
    ///   - account: Account identifier for the keychain item
    ///   - accessibility: Accessibility level for the stored item
    ///   - requiresBiometric: Whether biometric authentication is required
    /// - Returns: Result indicating success or specific error
    func save(data: Data, service: String, account: String,
             accessibility: KeychainAccessibility = .whenUnlocked,
             requiresBiometric: Bool = false) -> Result<Void, KeychainError> {
        
        return queue.sync {
            if requiresBiometric {
                guard context?.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) == true else {
                    return .failure(.biometricNotAvailable)
                }
            }
            
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecValueData as String: data,
                kSecAttrAccessible as String: accessibility.secAccessibility
            ]
            
            if let accessGroup = accessGroup {
                query[kSecAttrAccessGroup as String] = accessGroup
            }
            
            query[kSecAttrSynchronizable as String] = synchronizable
            
            if requiresBiometric {
                guard let accessControl = SecAccessControlCreateWithFlags(nil,
                    accessibility.secAccessibility,
                    .biometryAny,
                    nil) else {
                    return .failure(.encryptionFailed)
                }
                query[kSecAttrAccessControl as String] = accessControl
            }
            
            let status = SecItemAdd(query as CFDictionary, nil)
            
            switch status {
            case errSecSuccess:
                return .success(())
            case errSecDuplicateItem:
                return update(data: data, service: service, account: account,
                            accessibility: accessibility, requiresBiometric: requiresBiometric)
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Retrieves data from the keychain
    /// - Parameters:
    ///   - service: Service identifier for the keychain item
    ///   - account: Account identifier for the keychain item
    ///   - requiresBiometric: Whether biometric authentication is required
    /// - Returns: Result containing the retrieved data or error
    func retrieve(service: String, account: String, requiresBiometric: Bool = false) -> Result<Data, KeychainError> {
        return queue.sync {
            if requiresBiometric {
                var error: NSError?
                guard context?.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) == true else {
                    return .failure(.biometricNotAvailable)
                }
                
                var authError: NSError?
                guard context?.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                            localizedReason: "Authenticate to access secure data") == true else {
                    return .failure(.authenticationFailed)
                }
            }
            
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true
            ]
            
            if let accessGroup = accessGroup {
                query[kSecAttrAccessGroup as String] = accessGroup
            }
            
            query[kSecAttrSynchronizable as String] = synchronizable
            
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            
            switch status {
            case errSecSuccess:
                guard let data = result as? Data else {
                    return .failure(.invalidData)
                }
                return .success(data)
            case errSecItemNotFound:
                return .failure(.itemNotFound)
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Deletes an item from the keychain
    /// - Parameters:
    ///   - service: Service identifier for the keychain item
    ///   - account: Account identifier for the keychain item
    /// - Returns: Result indicating success or specific error
    func delete(service: String, account: String) -> Result<Void, KeychainError> {
        return queue.sync {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecAttrSynchronizable as String: synchronizable
            ]
            
            let status = SecItemDelete(query as CFDictionary)
            
            switch status {
            case errSecSuccess, errSecItemNotFound:
                return .success(())
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Updates existing keychain item with new data
    /// - Parameters:
    ///   - data: The new data to store
    ///   - service: Service identifier for the keychain item
    ///   - account: Account identifier for the keychain item
    ///   - accessibility: Accessibility level for the stored item
    ///   - requiresBiometric: Whether biometric authentication is required
    /// - Returns: Result indicating success or specific error
    private func update(data: Data, service: String, account: String,
                       accessibility: KeychainAccessibility,
                       requiresBiometric: Bool) -> Result<Void, KeychainError> {
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: synchronizable
        ]
        
        var attributesToUpdate: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility.secAccessibility
        ]
        
        if requiresBiometric {
            guard let accessControl = SecAccessControlCreateWithFlags(nil,
                accessibility.secAccessibility,
                .biometryAny,
                nil) else {
                return .failure(.encryptionFailed)
            }
            attributesToUpdate[kSecAttrAccessControl as String] = accessControl
        }
        
        let status = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)
        
        switch status {
        case errSecSuccess:
            return .success(())
        default:
            return .failure(.unexpectedStatus(status))
        }
    }
}