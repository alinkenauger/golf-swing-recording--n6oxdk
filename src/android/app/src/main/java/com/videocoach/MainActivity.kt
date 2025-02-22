package com.videocoach

import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityManager
import androidx.lifecycle.SavedStateHandle
import androidx.navigation.NavController
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.analytics.FirebaseAnalytics // v21.5.0
import com.videocoach.presentation.base.BaseActivity
import com.videocoach.utils.Constants
import com.videocoach.utils.NetworkUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

private const val TAG = "MainActivity"
private const val NAVIGATION_STATE_KEY = "navigation_state"
private const val DEEP_LINK_TIMEOUT = 5000L

/**
 * Main entry point for the Video Coaching Platform Android application.
 * Implements secure navigation, state preservation, and accessibility features.
 */
class MainActivity : BaseActivity() {

    private lateinit var navController: NavController
    private lateinit var bottomNav: BottomNavigationView
    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var navigationAnalytics: FirebaseAnalytics
    private var deepLinkJob: Job? = null
    private var accessibilityManager: AccessibilityManager? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize components
        savedStateHandle = SavedStateHandle()
        navigationAnalytics = FirebaseAnalytics.getInstance(this)
        accessibilityManager = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
        
        // Restore saved state if exists
        savedInstanceState?.let {
            savedStateHandle.set(NAVIGATION_STATE_KEY, it.getInt(NAVIGATION_STATE_KEY))
        }
    }

    override fun initializeView() {
        setContentView(R.layout.activity_main)
        
        // Initialize navigation components
        bottomNav = findViewById(R.id.bottom_navigation)
        setupNavigation()
        
        // Handle deep links if any
        intent?.data?.let { deepLinkUri ->
            handleDeepLink(deepLinkUri)
        }
    }

    private fun setupNavigation() {
        try {
            // Find nav host fragment with security validation
            val navHostFragment = supportFragmentManager
                .findFragmentById(R.id.nav_host_fragment) as? NavHostFragment
                ?: throw IllegalStateException("Nav host fragment not found")

            navController = navHostFragment.navController

            // Configure bottom navigation with accessibility support
            bottomNav.apply {
                setupWithNavController(navController)
                if (accessibilityManager?.isEnabled == true) {
                    contentDescription = "Main Navigation"
                    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
                }
            }

            // Setup navigation state tracking
            navController.addOnDestinationChangedListener { _, destination, _ ->
                // Track navigation analytics
                navigationAnalytics.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, Bundle().apply {
                    putString(FirebaseAnalytics.Param.SCREEN_NAME, destination.label.toString())
                })
                
                // Save navigation state
                savedStateHandle.set(NAVIGATION_STATE_KEY, destination.id)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Navigation setup failed", e)
            showError(NetworkUtils.handleNetworkError(e, 0))
        }
    }

    private fun handleDeepLink(deepLinkUri: Uri): Boolean {
        // Cancel any existing deep link job
        deepLinkJob?.cancel()

        return try {
            // Validate deep link URI
            if (!isValidDeepLink(deepLinkUri)) {
                Log.w(TAG, "Invalid deep link: $deepLinkUri")
                return false
            }

            // Handle deep link with timeout
            deepLinkJob = lifecycleScope.launch {
                val result = withTimeoutOrNull(DEEP_LINK_TIMEOUT) {
                    navController.navigate(
                        deepLinkUri,
                        navOptions {
                            anim {
                                enter = android.R.anim.fade_in
                                exit = android.R.anim.fade_out
                            }
                        }
                    )
                    true
                }

                if (result == null) {
                    Log.w(TAG, "Deep link handling timed out: $deepLinkUri")
                    showError(NetworkUtils.handleNetworkError(
                        Exception("Deep link timeout"),
                        0
                    ))
                }
            }
            true

        } catch (e: Exception) {
            Log.e(TAG, "Deep link handling failed", e)
            showError(NetworkUtils.handleNetworkError(e, 0))
            false
        }
    }

    private fun isValidDeepLink(uri: Uri): Boolean {
        return uri.scheme in listOf("https", "videocoach") &&
               uri.host == "videocoach.com" &&
               uri.pathSegments.isNotEmpty()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        
        // Save navigation state
        savedStateHandle.get<Int>(NAVIGATION_STATE_KEY)?.let {
            outState.putInt(NAVIGATION_STATE_KEY, it)
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        
        // Clear non-essential resources
        navigationAnalytics.logEvent("low_memory", null)
        
        // Clear navigation backstack if needed
        if (navController.backQueue.size > Constants.UI.MAX_BACKSTACK_SIZE) {
            navController.popBackStack(
                navController.graph.startDestinationId,
                false
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        
        // Cleanup resources
        deepLinkJob?.cancel()
        accessibilityManager = null
    }
}