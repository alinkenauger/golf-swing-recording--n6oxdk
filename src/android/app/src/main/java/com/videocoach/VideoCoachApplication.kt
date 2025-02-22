package com.videocoach

import android.app.Application
import android.content.Context
import android.os.StrictMode
import android.util.Log
import androidx.lifecycle.ProcessLifecycleOwner
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.videocoach.utils.NetworkUtils
import dagger.hilt.android.HiltAndroidApp
import io.sentry.android.core.SentryAndroid
import io.sentry.SentryLevel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "VideoCoachApplication"

/**
 * Main application class for the Video Coaching Platform Android app.
 * Handles initialization of core services, dependency injection, and application lifecycle.
 */
@HiltAndroidApp
class VideoCoachApplication : Application() {

    // Application-wide coroutine scope with error handling
    private val applicationScope = CoroutineScope(
        SupervisorJob() + Dispatchers.Main + CoroutineExceptionHandler { _, throwable ->
            Log.e(TAG, "Coroutine error: ${throwable.message}", throwable)
            FirebaseCrashlytics.getInstance().recordException(throwable)
        }
    )

    // Application state
    private val _isInitialized = MutableStateFlow(false)
    val isInitialized = _isInitialized

    // Network monitoring
    private lateinit var networkMonitor: ConnectivityManager.NetworkCallback

    override fun onCreate() {
        // Enable strict mode for development builds
        if (BuildConfig.DEBUG) {
            enableStrictMode()
        }

        super.onCreate()

        initializeSentry()
        initializeFirebase()
        initializeNetworkMonitoring()
        initializeSecurityComponents()
        initializeAnalytics()

        // Register lifecycle observers
        ProcessLifecycleOwner.get().lifecycle.addObserver(AppLifecycleObserver())

        _isInitialized.value = true
    }

    private fun initializeSentry() {
        try {
            SentryAndroid.init(this) { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.environment = BuildConfig.BUILD_TYPE
                options.isDebug = BuildConfig.DEBUG
                options.tracesSampleRate = 1.0
                options.enableSessionTracking = true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sentry initialization failed", e)
            FirebaseCrashlytics.getInstance().recordException(e)
        }
    }

    private fun initializeFirebase() {
        try {
            FirebaseApp.initializeApp(this)
            FirebaseCrashlytics.getInstance().apply {
                setCrashlyticsCollectionEnabled(!BuildConfig.DEBUG)
                setCustomKey("build_type", BuildConfig.BUILD_TYPE)
                setCustomKey("version_name", BuildConfig.VERSION_NAME)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Firebase initialization failed", e)
            SentryAndroid.captureException(e)
        }
    }

    private fun initializeNetworkMonitoring() {
        applicationScope.launch {
            try {
                val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                networkMonitor = NetworkUtils.registerNetworkCallback(connectivityManager) { isAvailable ->
                    if (!isAvailable) {
                        SentryAndroid.captureMessage(
                            "Network connectivity lost",
                            SentryLevel.WARNING
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network monitoring initialization failed", e)
                FirebaseCrashlytics.getInstance().recordException(e)
            }
        }
    }

    private fun initializeSecurityComponents() {
        try {
            // Initialize security provider
            Security.insertProviderAt(BouncyCastleProvider(), 1)

            // Enable network security config
            NetworkSecurityPolicy.getInstance().apply {
                setCleartextTrafficPermitted(false)
            }

            // Initialize encryption manager
            EncryptionManager.initialize(this)
        } catch (e: Exception) {
            Log.e(TAG, "Security components initialization failed", e)
            FirebaseCrashlytics.getInstance().recordException(e)
            SentryAndroid.captureException(e)
        }
    }

    private fun initializeAnalytics() {
        try {
            FirebaseAnalytics.getInstance(this).apply {
                setAnalyticsCollectionEnabled(!BuildConfig.DEBUG)
                setUserProperty("app_version", BuildConfig.VERSION_NAME)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Analytics initialization failed", e)
            FirebaseCrashlytics.getInstance().recordException(e)
        }
    }

    private fun enableStrictMode() {
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectDiskReads()
                .detectDiskWrites()
                .detectNetwork()
                .penaltyLog()
                .build()
        )

        StrictMode.setVmPolicy(
            StrictMode.VmPolicy.Builder()
                .detectLeakedSqlLiteObjects()
                .detectLeakedClosableObjects()
                .detectActivityLeaks()
                .penaltyLog()
                .build()
        )
    }

    override fun onLowMemory() {
        super.onLowMemory()
        try {
            // Clear non-essential caches
            ImageLoader.getInstance().clearMemoryCache()
            VideoCache.getInstance().trim()

            // Cancel non-critical coroutines
            applicationScope.coroutineContext.cancelChildren()

            // Log memory pressure
            SentryAndroid.captureMessage(
                "Low memory condition detected",
                SentryLevel.WARNING
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error handling low memory condition", e)
            FirebaseCrashlytics.getInstance().recordException(e)
        }
    }

    override fun onTerminate() {
        try {
            // Cancel all coroutines
            applicationScope.cancel()

            // Unregister network callback
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager.unregisterNetworkCallback(networkMonitor)

            // Clear sensitive data
            EncryptionManager.clearKeys()
            
            // Shutdown analytics
            FirebaseAnalytics.getInstance(this).setAnalyticsCollectionEnabled(false)
        } catch (e: Exception) {
            Log.e(TAG, "Error during application termination", e)
            FirebaseCrashlytics.getInstance().recordException(e)
        } finally {
            super.onTerminate()
        }
    }

    companion object {
        @Volatile
        private var instance: VideoCoachApplication? = null

        fun getInstance(): VideoCoachApplication {
            return instance ?: synchronized(this) {
                instance ?: throw IllegalStateException("Application not initialized")
            }
        }
    }
}