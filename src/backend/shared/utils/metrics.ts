import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { Logger } from './logger';
import { VIDEO_STATUS } from '../constants';

// Global configuration constants
const DEFAULT_METRICS_PREFIX = 'videocoach_';
const METRICS_PATH = '/metrics';
const METRIC_COLLECTION_INTERVAL = 10000; // 10 seconds
const METRIC_BUFFER_SIZE = 1000;

// Metric configuration types
interface MetricsConfig {
  prefix?: string;
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
  interval?: number;
}

interface RequestMetadata {
  userId?: string;
  userRole?: string;
  correlationId?: string;
  endpoint?: string;
}

interface VideoMetrics {
  size: number;
  format: string;
  processingSteps: string[];
  resourceUsage: {
    cpu: number;
    memory: number;
  };
}

/**
 * Advanced metrics service for standardized monitoring across microservices
 * Implements Prometheus integration with enhanced collection and aggregation
 * @version 1.0.0
 */
export class MetricsService {
  private readonly registry: Registry;
  private readonly serviceName: string;
  private readonly logger: Logger;
  private readonly prefix: string;
  
  // Core metrics collectors
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly httpErrorsTotal: Counter;
  private readonly activeConnections: Gauge;
  
  // Video processing specific metrics
  private readonly videoProcessingDuration: Histogram;
  private readonly videoProcessingStatus: Counter;
  private readonly videoProcessingQueue: Gauge;
  
  // System metrics
  private readonly memoryUsage: Gauge;
  private readonly cpuUsage: Gauge;

  /**
   * Initialize metrics service with comprehensive collectors
   */
  constructor(serviceName: string, config: MetricsConfig = {}) {
    this.serviceName = serviceName;
    this.logger = new Logger(serviceName);
    this.prefix = config.prefix || DEFAULT_METRICS_PREFIX;
    
    // Initialize Prometheus registry with default labels
    this.registry = new Registry();
    this.registry.setDefaultLabels({
      service: serviceName,
      environment: process.env.NODE_ENV || 'development',
      ...config.defaultLabels
    });

    // Initialize HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: `${this.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });

    this.httpRequestTotal = new Counter({
      name: `${this.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code']
    });

    this.httpErrorsTotal = new Counter({
      name: `${this.prefix}http_errors_total`,
      help: 'Total number of HTTP errors',
      labelNames: ['method', 'path', 'error_code']
    });

    this.activeConnections = new Gauge({
      name: `${this.prefix}active_connections`,
      help: 'Number of active connections'
    });

    // Initialize video processing metrics
    this.videoProcessingDuration = new Histogram({
      name: `${this.prefix}video_processing_duration_seconds`,
      help: 'Video processing duration in seconds',
      labelNames: ['status', 'format'],
      buckets: [10, 30, 60, 120, 300, 600, 1800, 3600]
    });

    this.videoProcessingStatus = new Counter({
      name: `${this.prefix}video_processing_status_total`,
      help: 'Video processing status counts',
      labelNames: ['status']
    });

    this.videoProcessingQueue = new Gauge({
      name: `${this.prefix}video_processing_queue_size`,
      help: 'Current size of video processing queue'
    });

    // Initialize system metrics
    this.memoryUsage = new Gauge({
      name: `${this.prefix}memory_usage_bytes`,
      help: 'Process memory usage in bytes',
      labelNames: ['type']
    });

    this.cpuUsage = new Gauge({
      name: `${this.prefix}cpu_usage_percent`,
      help: 'Process CPU usage percentage'
    });

    // Register all metrics
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestTotal);
    this.registry.registerMetric(this.httpErrorsTotal);
    this.registry.registerMetric(this.activeConnections);
    this.registry.registerMetric(this.videoProcessingDuration);
    this.registry.registerMetric(this.videoProcessingStatus);
    this.registry.registerMetric(this.videoProcessingQueue);
    this.registry.registerMetric(this.memoryUsage);
    this.registry.registerMetric(this.cpuUsage);

    // Enable default metrics collection if configured
    if (config.collectDefaultMetrics !== false) {
      this.registry.setDefaultLabels({ service: serviceName });
      this.registry.startDefaultMetrics({ prefix: this.prefix });
    }
  }

  /**
   * Initialize metrics collectors and start collection intervals
   */
  public async initializeMetrics(): Promise<void> {
    try {
      // Start system metrics collection
      setInterval(() => {
        this.collectSystemMetrics();
      }, METRIC_COLLECTION_INTERVAL);

      this.logger.info('Metrics initialization completed', {
        service: this.serviceName,
        collectors: this.registry.getMetricsAsJSON()
      });
    } catch (error) {
      this.logger.error('Failed to initialize metrics', error);
      throw error;
    }
  }

  /**
   * Record HTTP request metrics with detailed tracking
   */
  public async recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    metadata?: RequestMetadata
  ): Promise<void> {
    try {
      const labels = { method, path, status_code: statusCode.toString() };

      this.httpRequestDuration.observe(labels, duration);
      this.httpRequestTotal.inc(labels);

      if (statusCode >= 400) {
        this.httpErrorsTotal.inc({
          method,
          path,
          error_code: statusCode.toString()
        });
      }

      this.logger.info('HTTP request metrics recorded', {
        ...labels,
        duration,
        ...metadata
      });
    } catch (error) {
      this.logger.error('Failed to record HTTP metrics', error);
    }
  }

  /**
   * Record video processing metrics with detailed tracking
   */
  public async recordVideoProcessing(
    videoId: string,
    duration: number,
    status: string,
    metrics: VideoMetrics
  ): Promise<void> {
    try {
      const labels = { status, format: metrics.format };

      this.videoProcessingDuration.observe(labels, duration);
      this.videoProcessingStatus.inc({ status });
      
      // Update resource usage metrics
      this.cpuUsage.set(metrics.resourceUsage.cpu);
      this.memoryUsage.set({ type: 'processing' }, metrics.resourceUsage.memory);

      this.logger.info('Video processing metrics recorded', {
        videoId,
        duration,
        status,
        ...metrics
      });
    } catch (error) {
      this.logger.error('Failed to record video processing metrics', error);
    }
  }

  /**
   * Express middleware for exposing metrics endpoint
   */
  public getMetricsMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (req.path === METRICS_PATH) {
        try {
          const metrics = await this.registry.metrics();
          res.set('Content-Type', this.registry.contentType);
          res.end(metrics);
        } catch (error) {
          this.logger.error('Failed to collect metrics', error);
          next(error);
        }
      } else {
        next();
      }
    };
  }

  /**
   * Collect system-level metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Memory metrics
      const memoryUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'heap' }, memoryUsage.heapUsed);
      this.memoryUsage.set({ type: 'rss' }, memoryUsage.rss);

      // CPU metrics
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = (endUsage.user + endUsage.system) / 1000000; // Convert to seconds
        this.cpuUsage.set(totalUsage);
      }, 100);

    } catch (error) {
      this.logger.error('Failed to collect system metrics', error);
    }
  }
}