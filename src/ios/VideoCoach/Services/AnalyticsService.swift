//
// AnalyticsService.swift
// VideoCoach
//
// Service responsible for tracking and analyzing user interactions, video engagement metrics,
// performance data, and network quality metrics in the Video Coaching Platform iOS app
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation
import Combine

/// Defines the types of analytics events that can be tracked
public enum AnalyticsEvent: String {
    case videoView = "video_view"
    case videoUpload = "video_upload"
    case videoAnnotation = "video_annotation"
    case videoProcessingStart = "video_processing_start"
    case videoProcessingComplete = "video_processing_complete"
    case sessionStart = "session_start"
    case sessionEnd = "session_end"
    case paymentSuccess = "payment_success"
    case paymentFailure = "payment_failure"
    case messageReceived = "message_received"
    case messageSent = "message_sent"
    case networkQualityChange = "network_quality_change"
    case errorOccurred = "error_occurred"
}

/// Defines the types of metrics that can be recorded
public enum AnalyticsMetric: String {
    case duration = "duration"
    case fileSize = "file_size"
    case processingTime = "processing_time"
    case networkSpeed = "network_speed"
    case networkLatency = "network_latency"
    case errorRate = "error_rate"
    case uploadSpeed = "upload_speed"
    case downloadSpeed = "download_speed"
    case processingQueueLength = "processing_queue_length"
}

/// Represents the quality of network connection
public enum NetworkQuality: String {
    case excellent = "excellent"
    case good = "good"
    case fair = "fair"
    case poor = "poor"
    case none = "none"
}

/// Analytics report structure
public struct AnalyticsReport {
    let period: DateInterval
    let events: [String: Int]
    let metrics: [String: Double]
    let networkQuality: [String: Double]
    let errorRates: [String: Double]
}

/// Service responsible for tracking and analyzing user interactions and system performance
@available(iOS 14.0, *)
public final class AnalyticsService {
    
    // MARK: - Singleton Instance
    
    /// Shared instance of the analytics service
    public static let shared = AnalyticsService()
    
    // MARK: - Private Properties
    
    private let eventSubject = PassthroughSubject<(AnalyticsEvent, [String: Any]?), Never>()
    private let metricSubject = PassthroughSubject<(AnalyticsMetric, Double), Never>()
    private let networkQualitySubject = PassthroughSubject<NetworkQuality, Never>()
    private var cancellables = Set<AnyCancellable>()
    private let retryLimit = 3
    private let batchSize = 50
    private let processingQueue = DispatchQueue(label: "com.videocoach.analytics", qos: .utility)
    
    // MARK: - Initialization
    
    private init() {
        setupEventProcessing()
        setupNetworkMonitoring()
        setupBatchProcessing()
    }
    
    // MARK: - Public Methods
    
    /// Tracks a specific analytics event with metadata
    /// - Parameters:
    ///   - event: The type of event to track
    ///   - metadata: Optional additional context for the event
    public func trackEvent(_ event: AnalyticsEvent, metadata: [String: Any]? = nil) {
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            var enrichedMetadata = metadata ?? [:]
            enrichedMetadata["timestamp"] = Date().timeIntervalSince1970
            enrichedMetadata["device_info"] = self.getDeviceInfo()
            enrichedMetadata["network_quality"] = NetworkMonitor.shared.connectionQuality.value.rawValue
            enrichedMetadata["connection_type"] = NetworkMonitor.shared.connectionType.value.rawValue
            
            self.eventSubject.send((event, enrichedMetadata))
        }
    }
    
    /// Records a numeric metric with context
    /// - Parameters:
    ///   - metric: The type of metric to record
    ///   - value: The numeric value of the metric
    public func recordMetric(_ metric: AnalyticsMetric, value: Double) {
        processingQueue.async { [weak self] in
            self?.metricSubject.send((metric, value))
        }
    }
    
    /// Generates an analytics report for a specific time period
    /// - Parameter period: The time interval for the report
    /// - Returns: Publisher that emits the analytics report
    public func generateReport(for period: DateInterval) -> AnyPublisher<AnalyticsReport, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NSError(domain: "AnalyticsService", code: -1)))
                return
            }
            
            self.processingQueue.async {
                // Implementation would aggregate stored events and metrics
                let report = AnalyticsReport(
                    period: period,
                    events: [:],
                    metrics: [:],
                    networkQuality: [:],
                    errorRates: [:]
                )
                promise(.success(report))
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupEventProcessing() {
        eventSubject
            .collect(.byTime(processingQueue, .seconds(5)))
            .filter { !$0.isEmpty }
            .flatMap { [weak self] events -> AnyPublisher<Void, Error> in
                guard let self = self else {
                    return Fail(error: NSError(domain: "AnalyticsService", code: -1))
                        .eraseToAnyPublisher()
                }
                return self.processBatch(events)
            }
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        print("Analytics processing error: \(error)")
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.connectionQuality
            .map { quality -> NetworkQuality in
                switch quality {
                case .excellent: return .excellent
                case .good: return .good
                case .fair: return .fair
                case .poor: return .poor
                case .unknown: return .none
                }
            }
            .sink { [weak self] quality in
                self?.networkQualitySubject.send(quality)
                self?.trackEvent(.networkQualityChange, metadata: ["quality": quality.rawValue])
            }
            .store(in: &cancellables)
    }
    
    private func setupBatchProcessing() {
        metricSubject
            .collect(.byTime(processingQueue, .seconds(10)))
            .sink { [weak self] metrics in
                self?.processingQueue.async {
                    // Process collected metrics
                    metrics.forEach { metric, value in
                        print("Processing metric: \(metric.rawValue) = \(value)")
                    }
                }
            }
            .store(in: &cancellables)
    }
    
    private func processBatch(_ events: [(AnalyticsEvent, [String: Any]?)]) -> AnyPublisher<Void, Error> {
        var attempt = 0
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NSError(domain: "AnalyticsService", code: -1)))
                return
            }
            
            func retry() {
                guard attempt < self.retryLimit else {
                    promise(.failure(NSError(domain: "AnalyticsService", code: -2)))
                    return
                }
                
                attempt += 1
                
                // Implement exponential backoff
                DispatchQueue.global().asyncAfter(deadline: .now() + Double(attempt * 2)) {
                    // Attempt to send batch to analytics backend
                    promise(.success(()))
                }
            }
            
            retry()
        }.eraseToAnyPublisher()
    }
    
    private func getDeviceInfo() -> [String: String] {
        return [
            "model": UIDevice.current.model,
            "system_version": UIDevice.current.systemVersion,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        ]
    }
}