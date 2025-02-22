package com.videocoach

import android.content.Context
import android.net.ConnectivityManager
import android.security.NetworkSecurityPolicy
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.videocoach.utils.NetworkUtils
import com.videocoach.utils.NetworkType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineDispatcher
import kotlinx.coroutines.test.runBlockingTest
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.CoreMatchers.notNullValue
import org.hamcrest.MatcherAssert.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.security.Security
import javax.net.ssl.SSLContext

/**
 * Comprehensive instrumented test class for the Video Coaching Platform Android app.
 * Validates core functionality, performance, and security in a device/emulator environment.
 *
 * @version 1.0
 */
@ExperimentalCoroutinesApi
@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {

    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    private val testDispatcher = TestCoroutineDispatcher()
    private lateinit var context: Context
    private lateinit var app: VideoCoachApplication
    private lateinit var connectivityManager: ConnectivityManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        app = context as VideoCoachApplication
        connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    @After
    fun tearDown() {
        testDispatcher.cleanupTestCoroutines()
    }

    /**
     * Verifies correct application package context and security configuration.
     */
    @Test
    fun useAppContext() {
        // Context validation
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertThat(appContext.packageName, equalTo("com.videocoach"))
        
        // Security provider verification
        val providers = Security.getProviders()
        assertThat(providers.any { it.name == "BC" }, equalTo(true))
        
        // SSL configuration check
        val sslContext = SSLContext.getDefault()
        assertThat(sslContext.protocol, equalTo("TLSv1.3"))
        
        // Network security policy verification
        val networkSecurityPolicy = NetworkSecurityPolicy.getInstance()
        assertThat(networkSecurityPolicy.isCleartextTrafficPermitted, equalTo(false))
    }

    /**
     * Verifies proper initialization of all application components and services.
     */
    @Test
    fun testApplicationInitialization() = runBlockingTest {
        // Application state verification
        assertThat(app.isInitialized.value, equalTo(true))
        
        // Network monitor initialization check
        val networkType = NetworkUtils.getNetworkType(context)
        assertThat(networkType, notNullValue())
        
        // Dependency injection verification
        assertThat(app.networkMonitor, notNullValue())
        
        // Firebase initialization check
        assertThat(FirebaseApp.getInstance(), notNullValue())
        
        // Sentry initialization verification
        assertThat(SentryAndroid.isEnabled(), equalTo(true))
    }

    /**
     * Comprehensive verification of MainActivity launch and state management.
     */
    @Test
    fun testMainActivityLaunch() {
        activityRule.scenario.use { scenario ->
            scenario.onActivity { activity ->
                // Activity state verification
                assertThat(activity, notNullValue())
                assertThat(activity.isFinishing, equalTo(false))
                
                // View hierarchy check
                val rootView = activity.window.decorView
                assertThat(rootView.isAttachedToWindow, equalTo(true))
                
                // Navigation component verification
                val navController = activity.findNavController(R.id.nav_host_fragment)
                assertThat(navController.currentDestination?.id, equalTo(R.id.homeFragment))
                
                // Memory usage check
                val runtime = Runtime.getRuntime()
                val usedMemoryMB = (runtime.totalMemory() - runtime.freeMemory()) / 1048576L
                assertThat(usedMemoryMB < 200, equalTo(true))
            }
        }
    }

    /**
     * Validates application behavior under different network conditions.
     */
    @Test
    fun testNetworkHandling() = runBlockingTest {
        // Initial network state verification
        var isNetworkAvailable = NetworkUtils.isNetworkAvailable(context)
        assertThat(isNetworkAvailable, notNullValue())
        
        // Network capability verification
        val isHighBandwidth = NetworkUtils.isHighBandwidthConnection(context)
        assertThat(isHighBandwidth, notNullValue())
        
        // Offline mode testing
        NetworkUtils.simulateNetworkCondition(connectivityManager, NetworkType.NONE)
        isNetworkAvailable = NetworkUtils.isNetworkAvailable(context)
        assertThat(isNetworkAvailable, equalTo(false))
        
        // Network recovery testing
        NetworkUtils.simulateNetworkCondition(connectivityManager, NetworkType.WIFI)
        isNetworkAvailable = NetworkUtils.isNetworkAvailable(context)
        assertThat(isNetworkAvailable, equalTo(true))
    }

    /**
     * Verifies application security setup and encryption.
     */
    @Test
    fun testSecurityConfiguration() {
        // SSL pinning verification
        val certificates = context.assets.open("certificates").use { it.readBytes() }
        assertThat(certificates.isNotEmpty(), equalTo(true))
        
        // Encryption verification
        val encryptionManager = EncryptionManager.getInstance()
        assertThat(encryptionManager.isInitialized(), equalTo(true))
        
        // Secure storage verification
        val securePreferences = context.getSharedPreferences("secure_prefs", Context.MODE_PRIVATE)
        assertThat(securePreferences.all.isEmpty(), equalTo(true))
        
        // Authentication state verification
        assertThat(app.isUserAuthenticated(), equalTo(false))
    }
}