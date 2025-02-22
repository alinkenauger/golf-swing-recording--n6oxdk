"""
FastAPI Application Entry Point
Provides a production-ready video processing service with comprehensive middleware,
security, monitoring and error handling capabilities.

Version: 1.0.0
"""

import asyncio
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
import elastic_apm
from elastic_apm.contrib.fastapi import ElasticAPM
import fastapi_limiter
from fastapi_limiter import FastAPILimiter
from fastapi_correlation_id import CorrelationIdMiddleware
import structlog
import redis.asyncio as redis
import uvicorn

from .config import load_config
from .controllers.video_controller import router as video_router
from .controllers.annotation_controller import router as annotation_router
from .utils.logger import VideoServiceLogger

# Initialize FastAPI application with OpenAPI documentation
app = FastAPI(
    title="Video Service",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Load configuration
config = load_config()

# Initialize logger
logger = VideoServiceLogger(
    service_name="video-service",
    environment=config["ENVIRONMENT"],
    enable_json=True,
    apm_config={
        "server_url": config["ELASTIC_APM_SERVER_URL"],
        "service_name": config["ELASTIC_APM_SERVICE_NAME"],
        "environment": config["ELASTIC_APM_ENVIRONMENT"]
    }
)

async def configure_middleware() -> None:
    """Configure comprehensive middleware stack for production use."""
    # CORS middleware with configured origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.get("CORS_ORIGINS", ["*"]),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )

    # Security middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=config.get("ALLOWED_HOSTS", ["*"])
    )

    # Compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Request correlation middleware
    app.add_middleware(
        CorrelationIdMiddleware,
        header_name="X-Correlation-ID"
    )

    # APM middleware
    app.add_middleware(ElasticAPM, client=elastic_apm.Client(
        service_name=config["ELASTIC_APM_SERVICE_NAME"],
        server_url=config["ELASTIC_APM_SERVER_URL"],
        environment=config["ELASTIC_APM_ENVIRONMENT"]
    ))

    # Initialize rate limiter with Redis
    redis_instance = redis.from_url(config["REDIS_URL"])
    await FastAPILimiter.init(redis_instance)

async def configure_routes() -> None:
    """Register API routes and controllers."""
    # Mount video processing routes
    app.include_router(
        video_router,
        prefix="/api/v1/videos",
        tags=["videos"]
    )

    # Mount annotation routes
    app.include_router(
        annotation_router,
        prefix="/api/v1/annotations",
        tags=["annotations"]
    )

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "version": app.version,
            "environment": config["ENVIRONMENT"]
        }

    # Readiness probe
    @app.get("/ready")
    async def readiness_check():
        return {"status": "ready"}

async def configure_exception_handlers() -> None:
    """Configure comprehensive exception handling."""
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception",
            exc_info=exc,
            extra={"path": request.url.path}
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "correlation_id": request.state.correlation_id
            }
        )

    @app.exception_handler(fastapi_limiter.RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "retry_after": str(exc.retry_after)
            }
        )

def configure_monitoring() -> None:
    """Configure application monitoring and metrics."""
    # Initialize Prometheus metrics
    instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=["/health", "/metrics"],
        env_var_name="ENABLE_METRICS",
        inprogress_name="video_service_inprogress",
        inprogress_labels=True
    )
    instrumentator.instrument(app)

    # Add custom metrics
    instrumentator.add(
        metrics_namespace="video_service",
        metrics_subsystem="http",
        metrics_gatherer=lambda: None
    )

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    try:
        # Configure all components
        await configure_middleware()
        await configure_routes()
        await configure_exception_handlers()
        configure_monitoring()

        logger.info(
            "Video service started successfully",
            extra={
                "environment": config["ENVIRONMENT"],
                "version": app.version
            }
        )
    except Exception as e:
        logger.error("Failed to start video service", exc_info=e)
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    try:
        # Cleanup connections
        await FastAPILimiter.close()
        
        logger.info("Video service shutdown complete")
    except Exception as e:
        logger.error("Error during shutdown", exc_info=e)
        raise

def main():
    """Application entry point with production configuration."""
    uvicorn.run(
        "app:app",
        host=config["HOST"],
        port=config["PORT"],
        workers=config.get("WORKERS", 4),
        loop="uvloop",
        log_level=config["LOG_LEVEL"].lower(),
        reload=config["DEBUG"],
        proxy_headers=True,
        forwarded_allow_ips="*"
    )

if __name__ == "__main__":
    main()