import logging
import json
import json_logging  # version: 1.3.0
import elasticapm  # version: 6.15.1
from typing import Optional, Dict, Any
from logging.handlers import MemoryHandler
from copy import deepcopy

# Global constants for logging configuration
DEFAULT_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(trace_id)s"
JSON_FORMAT = {
    "timestamp": "%(asctime)s",
    "service": "%(name)s",
    "level": "%(levelname)s",
    "message": "%(message)s",
    "trace_id": "%(trace_id)s",
    "context": "%(context)s"
}
DEFAULT_LOG_LEVEL = "INFO"
ENVIRONMENT_LOG_LEVELS = {
    "development": "DEBUG",
    "staging": "INFO",
    "production": "WARNING"
}

# PII fields that should be redacted from logs
PII_FIELDS = {'email', 'password', 'phone', 'address', 'credit_card', 'ssn'}

class VideoServiceLogger:
    """
    Enhanced logger class for video service providing structured logging with context,
    APM integration, and ELK compatibility.
    """
    
    def __init__(
        self,
        service_name: str,
        log_level: Optional[str] = None,
        environment: str = "development",
        initial_context: Optional[Dict[str, Any]] = None,
        enable_json: bool = True,
        apm_config: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Initialize the logger with service configuration and APM integration.

        Args:
            service_name: Name of the service for log identification
            log_level: Explicit log level override
            environment: Deployment environment (development/staging/production)
            initial_context: Initial context dictionary for all log messages
            enable_json: Whether to enable JSON formatted logging
            apm_config: Configuration dictionary for Elastic APM
        """
        self._service_name = service_name
        self._environment = environment
        self._json_enabled = enable_json
        self._context = initial_context or {}
        
        # Initialize base logger
        self._logger = logging.getLogger(service_name)
        
        # Set log level based on environment with override option
        selected_level = log_level or ENVIRONMENT_LOG_LEVELS.get(environment, DEFAULT_LOG_LEVEL)
        self._logger.setLevel(getattr(logging, selected_level.upper()))
        
        # Configure JSON logging if enabled
        if enable_json:
            json_logging.init_non_web(enable_json=True)
            formatter = json_logging.JSONLogFormatter(JSON_FORMAT)
        else:
            formatter = logging.Formatter(DEFAULT_FORMAT)
        
        # Configure console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        self._logger.addHandler(console_handler)
        
        # Configure memory handler for buffering
        self._memory_handler = MemoryHandler(capacity=1000, 
                                           flushLevel=logging.ERROR,
                                           target=console_handler)
        self._logger.addHandler(self._memory_handler)
        
        # Initialize APM client if config provided
        self._apm_client = None
        if apm_config:
            self._apm_client = elasticapm.Client(**apm_config)
            elasticapm.instrument()

    def _get_trace_context(self) -> Dict[str, str]:
        """Get current trace context from APM if available."""
        if self._apm_client and elasticapm.get_trace_id():
            return {
                'trace_id': elasticapm.get_trace_id(),
                'transaction_id': elasticapm.get_transaction_id(),
                'span_id': elasticapm.get_span_id()
            }
        return {'trace_id': 'N/A', 'transaction_id': 'N/A', 'span_id': 'N/A'}

    def _prepare_log_context(self, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Prepare context dictionary for logging with trace information."""
        context = deepcopy(self._context)
        if extra:
            context.update(extra)
        context.update(self._get_trace_context())
        return context

    def info(self, message: str, extra: Optional[Dict[str, Any]] = None, buffer: bool = True) -> None:
        """
        Log an info level message with context and trace correlation.

        Args:
            message: The log message
            extra: Additional context for this specific log
            buffer: Whether to buffer the log message
        """
        context = self._prepare_log_context(extra)
        log_entry = {'message': message, 'context': context}
        
        if buffer:
            self._memory_handler.handle(
                logging.LogRecord(
                    self._service_name, logging.INFO, "", 0, 
                    json.dumps(log_entry) if self._json_enabled else message,
                    (), None
                )
            )
        else:
            self._logger.info(
                json.dumps(log_entry) if self._json_enabled else message,
                extra=context
            )

    def error(
        self,
        message: str,
        exc_info: Optional[Exception] = None,
        extra: Optional[Dict[str, Any]] = None,
        notify_apm: bool = True
    ) -> None:
        """
        Log an error level message with context, trace correlation, and exception details.

        Args:
            message: The error message
            exc_info: Exception information if available
            extra: Additional context for this specific log
            notify_apm: Whether to notify APM of the error
        """
        context = self._prepare_log_context(extra)
        
        if exc_info and notify_apm and self._apm_client:
            self._apm_client.capture_exception(exc_info=True)
            context['exception'] = str(exc_info)
        
        log_entry = {'message': message, 'context': context}
        self._logger.error(
            json.dumps(log_entry) if self._json_enabled else message,
            exc_info=exc_info,
            extra=context
        )

    def debug(self, message: str, extra: Optional[Dict[str, Any]] = None, buffer: bool = True) -> None:
        """
        Log a debug level message with context and trace correlation.

        Args:
            message: The debug message
            extra: Additional context for this specific log
            buffer: Whether to buffer the log message
        """
        context = self._prepare_log_context(extra)
        log_entry = {'message': message, 'context': context}
        
        if buffer:
            self._memory_handler.handle(
                logging.LogRecord(
                    self._service_name, logging.DEBUG, "", 0,
                    json.dumps(log_entry) if self._json_enabled else message,
                    (), None
                )
            )
        else:
            self._logger.debug(
                json.dumps(log_entry) if self._json_enabled else message,
                extra=context
            )

    def warning(self, message: str, extra: Optional[Dict[str, Any]] = None, buffer: bool = True) -> None:
        """
        Log a warning level message with context and trace correlation.

        Args:
            message: The warning message
            extra: Additional context for this specific log
            buffer: Whether to buffer the log message
        """
        context = self._prepare_log_context(extra)
        log_entry = {'message': message, 'context': context}
        
        if buffer:
            self._memory_handler.handle(
                logging.LogRecord(
                    self._service_name, logging.WARNING, "", 0,
                    json.dumps(log_entry) if self._json_enabled else message,
                    (), None
                )
            )
        else:
            self._logger.warning(
                json.dumps(log_entry) if self._json_enabled else message,
                extra=context
            )

    def add_context(self, context: Dict[str, Any], redact_pii: bool = True) -> None:
        """
        Add persistent context to all subsequent log messages with PII redaction.

        Args:
            context: Context dictionary to add
            redact_pii: Whether to redact PII fields
        """
        if redact_pii:
            context = {
                k: '[REDACTED]' if k in PII_FIELDS else v
                for k, v in context.items()
            }
        self._context.update(context)
        
        if self._apm_client:
            self._apm_client.update_custom_context(context)

    def flush_buffer(self) -> None:
        """Flush any buffered log messages to output."""
        if self._memory_handler:
            self._memory_handler.flush()

def create_logger(
    service_name: str,
    environment: str = "development",
    apm_config: Optional[Dict[str, Any]] = None,
    **kwargs
) -> VideoServiceLogger:
    """
    Factory function to create and configure logger instances.

    Args:
        service_name: Name of the service
        environment: Deployment environment
        apm_config: Elastic APM configuration
        **kwargs: Additional configuration options

    Returns:
        Configured VideoServiceLogger instance
    """
    return VideoServiceLogger(
        service_name=service_name,
        environment=environment,
        apm_config=apm_config,
        **kwargs
    )