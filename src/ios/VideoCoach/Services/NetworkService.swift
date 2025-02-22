//
// NetworkService.swift
// VideoCoach
//
// Core networking service that handles all API communication for the Video Coaching Platform iOS app
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation // iOS 14.0+
import Combine   // iOS 14.0+

/// HTTP methods supported by the networking service
public enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

/// Custom networking errors
public enum NetworkError: LocalizedError {
    case noInternet
    case invalidURL
    case invalidResponse
    case serverError(Int, Data?)
    case decodingError
    case uploadError(String)
    case securityError
    case rateLimitExceeded
    case timeout
    case retryExhausted
    
    public var errorDescription: String? {
        switch self {
        case .noInternet: return "No internet connection available"
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid server response"
        case .serverError(let code, _): return "Server error: \(code)"
        case .decodingError: return "Failed to decode response"
        case .uploadError(let reason): return "Upload failed: \(reason)"
        case .securityError: return "Security verification failed"
        case .rateLimitExceeded: return "Rate limit exceeded"
        case .timeout: return "Request timed out"
        case .retryExhausted: return "Maximum retries exceeded"
        }
    }
}

/// Network event for analytics tracking
public struct NetworkEvent {
    let type: String
    let url: URL
    let statusCode: Int?
    let duration: TimeInterval
    let bytesSent: Int64?
    let bytesReceived: Int64?
    let error: Error?
}

/// Configuration for video uploads
public struct UploadConfiguration {
    let chunkSize: Int
    let compressionQuality: Float
    let allowsCellular: Bool
    let backgroundTaskIdentifier: String?
}

/// Progress information for video uploads
public struct UploadProgress {
    let bytesUploaded: Int64
    let totalBytes: Int64
    let progress: Double
    let estimatedTimeRemaining: TimeInterval?
    let speed: Double?
}

/// WebSocket configuration
public struct WebSocketConfiguration {
    let autoReconnect: Bool
    let reconnectInterval: TimeInterval
    let maxReconnectAttempts: Int
    let heartbeatInterval: TimeInterval
}

/// WebSocket events
public enum WebSocketEvent {
    case connected
    case disconnected(Error?)
    case message(Data)
    case error(Error)
}

@available(iOS 14.0, *)
public final class NetworkService {
    
    // MARK: - Singleton
    
    public static let shared = NetworkService()
    
    // MARK: - Private Properties
    
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let retryQueue: OperationQueue
    private let cache: URLCache
    private var websocketTasks: [String: URLSessionWebSocketTask] = [:]
    private let analyticsPublisher = PassthroughSubject<NetworkEvent, Never>()
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        // Configure URLSession with enhanced security
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = API.timeout
        configuration.timeoutIntervalForResource = API.timeout * 2
        configuration.waitsForConnectivity = true
        configuration.allowsCellularAccess = true
        configuration.allowsExpensiveNetworkAccess = true
        configuration.allowsConstrainedNetworkAccess = false
        
        // Configure SSL/TLS settings
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
        configuration.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "VideoCoach-iOS/1.0"
        ]
        
        // Initialize session
        session = URLSession(configuration: configuration)
        
        // Configure JSON coding
        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        
        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        
        // Configure retry queue
        retryQueue = OperationQueue()
        retryQueue.maxConcurrentOperationCount = 1
        retryQueue.qualityOfService = .utility
        
        // Configure cache
        cache = URLCache(memoryCapacity: 10_485_760, // 10MB
                        diskCapacity: 104_857_600,    // 100MB
                        directory: nil)
        
        // Setup network monitoring
        setupNetworkMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Performs a network request with automatic retry and error handling
    public func request<T: Decodable>(
        endpoint: String,
        method: HTTPMethod,
        body: Encodable? = nil,
        retryCount: Int = API.maxRetries
    ) -> AnyPublisher<T, Error> {
        guard NetworkMonitor.shared.isConnected.value else {
            return Fail(error: NetworkError.noInternet).eraseToAnyPublisher()
        }
        
        guard let url = URL(string: API.baseURL + endpoint) else {
            return Fail(error: NetworkError.invalidURL).eraseToAnyPublisher()
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.cachePolicy = .returnCacheDataElseLoad
        
        if let body = body {
            do {
                request.httpBody = try encoder.encode(body)
            } catch {
                return Fail(error: error).eraseToAnyPublisher()
            }
        }
        
        let startTime = Date()
        
        return session.dataTaskPublisher(for: request)
            .tryMap { [weak self] data, response in
                guard let self = self,
                      let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                // Track network event
                self.trackNetworkEvent(
                    url: url,
                    statusCode: httpResponse.statusCode,
                    startTime: startTime,
                    bytesReceived: Int64(data.count)
                )
                
                switch httpResponse.statusCode {
                case 200...299:
                    return data
                case 429:
                    throw NetworkError.rateLimitExceeded
                case 500...599:
                    throw NetworkError.serverError(httpResponse.statusCode, data)
                default:
                    throw NetworkError.serverError(httpResponse.statusCode, data)
                }
            }
            .decode(type: T.self, decoder: decoder)
            .tryCatch { error -> AnyPublisher<T, Error> in
                if retryCount > 0 && self.shouldRetry(error: error) {
                    return self.request(
                        endpoint: endpoint,
                        method: method,
                        body: body,
                        retryCount: retryCount - 1
                    )
                }
                throw error
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Uploads video with chunked transfer and progress tracking
    public func uploadVideo(
        fileURL: URL,
        filename: String,
        config: UploadConfiguration
    ) -> AnyPublisher<UploadProgress, Error> {
        guard NetworkMonitor.shared.isConnected.value else {
            return Fail(error: NetworkError.noInternet).eraseToAnyPublisher()
        }
        
        let subject = PassthroughSubject<UploadProgress, Error>()
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let fileSize = try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as! Int64
                guard fileSize <= VideoConfig.maxFileSize else {
                    throw NetworkError.uploadError("File size exceeds maximum limit")
                }
                
                var uploadedBytes: Int64 = 0
                let startTime = Date()
                
                // Create upload session
                let uploadURL = URL(string: API.baseURL + "/videos/upload")!
                var request = URLRequest(url: uploadURL)
                request.httpMethod = "POST"
                request.setValue("multipart/form-data", forHTTPHeaderField: "Content-Type")
                request.setValue(filename, forHTTPHeaderField: "X-File-Name")
                
                let task = self.session.uploadTask(with: request, fromFile: fileURL) { data, response, error in
                    if let error = error {
                        subject.send(completion: .failure(error))
                        return
                    }
                    
                    guard let httpResponse = response as? HTTPURLResponse else {
                        subject.send(completion: .failure(NetworkError.invalidResponse))
                        return
                    }
                    
                    if httpResponse.statusCode == 200 {
                        subject.send(completion: .finished)
                    } else {
                        subject.send(completion: .failure(NetworkError.serverError(httpResponse.statusCode, data)))
                    }
                }
                
                // Configure background task if needed
                if let identifier = config.backgroundTaskIdentifier {
                    task.taskDescription = identifier
                }
                
                // Observe progress
                task.progress.observe(\.fractionCompleted) { progress, _ in
                    let uploaded = Int64(Double(fileSize) * progress.fractionCompleted)
                    let speed = Double(uploaded - uploadedBytes) / Date().timeIntervalSince(startTime)
                    let remaining = speed > 0 ? Double(fileSize - uploaded) / speed : nil
                    
                    let progressInfo = UploadProgress(
                        bytesUploaded: uploaded,
                        totalBytes: fileSize,
                        progress: progress.fractionCompleted,
                        estimatedTimeRemaining: remaining,
                        speed: speed
                    )
                    
                    subject.send(progressInfo)
                    uploadedBytes = uploaded
                }
                
                task.resume()
                
            } catch {
                subject.send(completion: .failure(error))
            }
        }
        
        return subject.eraseToAnyPublisher()
    }
    
    /// Establishes and manages WebSocket connections
    public func connectWebSocket(
        endpoint: String,
        config: WebSocketConfiguration
    ) -> AnyPublisher<WebSocketEvent, Error> {
        guard let url = URL(string: API.baseURL.replacingOccurrences(of: "http", with: "ws") + endpoint) else {
            return Fail(error: NetworkError.invalidURL).eraseToAnyPublisher()
        }
        
        let subject = PassthroughSubject<WebSocketEvent, Error>()
        let task = session.webSocketTask(with: url)
        websocketTasks[endpoint] = task
        
        // Configure heartbeat
        if config.heartbeatInterval > 0 {
            setupHeartbeat(task: task, interval: config.heartbeatInterval)
        }
        
        // Handle messages
        receiveMessage(task: task, subject: subject)
        
        task.resume()
        subject.send(.connected)
        
        return subject
            .handleEvents(receiveCompletion: { [weak self] completion in
                if case .failure = completion, config.autoReconnect {
                    self?.handleReconnection(endpoint: endpoint, config: config)
                }
            })
            .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.connectionQuality
            .sink { [weak self] quality in
                self?.adjustNetworkConfiguration(for: quality)
            }
            .store(in: &cancellables)
    }
    
    private func adjustNetworkConfiguration(for quality: ConnectionQuality) {
        switch quality {
        case .excellent, .good:
            session.configuration.timeoutIntervalForRequest = API.timeout
        case .fair:
            session.configuration.timeoutIntervalForRequest = API.timeout * 1.5
        case .poor:
            session.configuration.timeoutIntervalForRequest = API.timeout * 2
        case .unknown:
            session.configuration.timeoutIntervalForRequest = API.timeout
        }
    }
    
    private func shouldRetry(error: Error) -> Bool {
        switch error {
        case NetworkError.serverError(let code, _):
            return code >= 500
        case NetworkError.timeout, NetworkError.rateLimitExceeded:
            return true
        default:
            return false
        }
    }
    
    private func trackNetworkEvent(
        url: URL,
        statusCode: Int,
        startTime: Date,
        bytesReceived: Int64?,
        bytesSent: Int64? = nil,
        error: Error? = nil
    ) {
        let event = NetworkEvent(
            type: "request",
            url: url,
            statusCode: statusCode,
            duration: Date().timeIntervalSince(startTime),
            bytesSent: bytesSent,
            bytesReceived: bytesReceived,
            error: error
        )
        analyticsPublisher.send(event)
    }
    
    private func setupHeartbeat(task: URLSessionWebSocketTask, interval: TimeInterval) {
        DispatchQueue.global().asyncAfter(deadline: .now() + interval) { [weak self] in
            guard let self = self,
                  task.state == .running else { return }
            
            task.sendPing { error in
                if error == nil {
                    self.setupHeartbeat(task: task, interval: interval)
                }
            }
        }
    }
    
    private func receiveMessage(
        task: URLSessionWebSocketTask,
        subject: PassthroughSubject<WebSocketEvent, Error>
    ) {
        task.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    subject.send(.message(data))
                case .string(let string):
                    if let data = string.data(using: .utf8) {
                        subject.send(.message(data))
                    }
                @unknown default:
                    break
                }
                self?.receiveMessage(task: task, subject: subject)
                
            case .failure(let error):
                subject.send(.error(error))
            }
        }
    }
    
    private func handleReconnection(
        endpoint: String,
        config: WebSocketConfiguration,
        attempt: Int = 0
    ) {
        guard attempt < config.maxReconnectAttempts else { return }
        
        DispatchQueue.global().asyncAfter(deadline: .now() + config.reconnectInterval) { [weak self] in
            self?.connectWebSocket(endpoint: endpoint, config: config)
        }
    }
}