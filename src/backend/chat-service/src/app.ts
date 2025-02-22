import express, { Application } from 'express'; // ^4.18.2
import { Server } from 'socket.io'; // ^4.7.0
import { createServer } from 'http';
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.1.0
import morgan from 'morgan'; // ^1.10.0
import { Container } from 'inversify'; // ^6.0.1
import * as prometheus from 'prom-client'; // ^14.2.0
import rateLimit from 'express-rate-limit'; // ^7.1.0
import { Logger } from '../../../shared/utils/logger';
import { server as serverConfig, socket as socketConfig } from './config';
import SocketHandlers from './socket/handlers';
import { ChatController } from './controllers/chat.controller';
import { ApiError } from '../../../shared/errors/api.error';

// Initialize container and logger
const container = new Container();
const logger = new Logger('ChatService');

/**
 * Configures Express middleware stack with security, monitoring and error handling
 */
function setupMiddleware(app: Application): void {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:']
      }
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: serverConfig.cors.origin,
    methods: serverConfig.cors.methods,
    credentials: serverConfig.cors.credentials,
    maxAge: serverConfig.cors.maxAge
  }));

  // Request logging
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Rate limiting
  app.use(rateLimit({
    windowMs: serverConfig.rateLimiting.windowMs,
    max: serverConfig.rateLimiting.max,
    message: serverConfig.rateLimiting.message,
    standardHeaders: serverConfig.rateLimiting.headers,
    legacyHeaders: false
  }));

  // Metrics endpoint
  const metricsRegistry = new prometheus.Registry();
  prometheus.collectDefaultMetrics({ register: metricsRegistry });
  
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    res.send(await metricsRegistry.metrics());
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json(err.toJSON());
    }

    logger.error('Unhandled error', err);
    return res.status(500).json({
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Initializes Socket.IO server with security and monitoring
 */
function setupWebSocket(httpServer: ReturnType<typeof createServer>): Server {
  const io = new Server(httpServer, {
    path: socketConfig.path,
    maxHttpBufferSize: socketConfig.maxHttpBufferSize,
    pingTimeout: socketConfig.pingTimeout,
    pingInterval: socketConfig.pingInterval,
    transports: socketConfig.transports,
    cors: {
      origin: serverConfig.cors.origin,
      methods: serverConfig.cors.methods,
      credentials: serverConfig.cors.credentials
    }
  });

  // Socket.IO middleware
  io.use(async (socket, next) => {
    try {
      const socketHandlers = container.get<SocketHandlers>(SocketHandlers);
      await socketHandlers.handleConnection(socket);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('Socket connection error'));
    }
  });

  // Socket metrics
  const socketMetrics = {
    connections: new prometheus.Gauge({
      name: 'websocket_connections_total',
      help: 'Total number of WebSocket connections'
    }),
    messages: new prometheus.Counter({
      name: 'websocket_messages_total',
      help: 'Total number of WebSocket messages',
      labelNames: ['type']
    })
  };

  io.on('connection', (socket) => {
    socketMetrics.connections.inc();

    socket.on('disconnect', () => {
      socketMetrics.connections.dec();
    });

    socket.on('message', () => {
      socketMetrics.messages.inc({ type: 'message' });
    });
  });

  return io;
}

/**
 * Configures dependency injection container
 */
function setupDependencyInjection(): void {
  container.bind<ChatController>(ChatController).toSelf();
  container.bind<SocketHandlers>(SocketHandlers).toSelf();
  container.bind<Logger>(Logger).toConstantValue(logger);
}

/**
 * Starts the Express server and WebSocket connections
 */
async function startServer(): Promise<void> {
  try {
    // Initialize Express app
    const app = express();
    setupMiddleware(app);
    setupDependencyInjection();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize WebSocket server
    const io = setupWebSocket(httpServer);
    global.io = io;

    // Start server
    httpServer.listen(serverConfig.port, () => {
      logger.info(`Server started on port ${serverConfig.port}`, {
        environment: process.env.NODE_ENV,
        socketPath: socketConfig.path
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Export for testing
export const app = express();
export const io = setupWebSocket(createServer(app));

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    logger.error('Server startup error', error as Error);
    process.exit(1);
  });
}