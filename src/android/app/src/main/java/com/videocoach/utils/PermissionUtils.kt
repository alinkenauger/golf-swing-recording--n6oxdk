package com.videocoach.utils

import android.app.Activity
import android.content.Context
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import android.util.Log

/**
 * Utility object providing comprehensive permission handling functionality for the Video Coach application.
 * Handles runtime permissions for video recording, storage access, and other critical features.
 * Implements version-specific permission handling for Android 10+ and includes caching for performance optimization.
 *
 * @since 1.0.0
 */
object PermissionUtils {
    private const val TAG = "PermissionUtils"
    private const val PERMISSION_REQUEST_CODE = 1001
    private const val PERMISSION_CACHE_DURATION = 5000L

    // Define required permissions based on Android API level
    private val REQUIRED_PERMISSIONS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_IMAGES
        )
    } else {
        arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
    }

    private var permissionCache: Boolean? = null
    private var lastCacheTime: Long = 0

    /**
     * Checks if all required permissions are granted with caching for performance optimization.
     *
     * @param context The application context
     * @return Boolean indicating if all permissions are granted
     */
    @JvmStatic
    fun hasRequiredPermissions(context: Context): Boolean {
        // Check cache validity
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastCacheTime < PERMISSION_CACHE_DURATION && permissionCache != null) {
            Log.d(TAG, "Returning cached permission result: $permissionCache")
            return permissionCache!!
        }

        try {
            val hasAllPermissions = REQUIRED_PERMISSIONS.all { permission ->
                ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
            }

            // Cache the result
            permissionCache = hasAllPermissions
            lastCacheTime = currentTime

            Log.d(TAG, "Permission check result: $hasAllPermissions")
            return hasAllPermissions
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception during permission check", e)
            return false
        }
    }

    /**
     * Requests all required permissions with proper error handling.
     *
     * @param activity The activity context for permission request
     */
    @JvmStatic
    fun requestPermissions(activity: Activity) {
        if (activity.isFinishing) {
            Log.w(TAG, "Activity is finishing, skipping permission request")
            return
        }

        try {
            // Clear permission cache before requesting
            permissionCache = null
            lastCacheTime = 0

            Log.d(TAG, "Requesting permissions: ${REQUIRED_PERMISSIONS.joinToString()}")
            ActivityCompat.requestPermissions(
                activity,
                REQUIRED_PERMISSIONS,
                PERMISSION_REQUEST_CODE
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception during permission request", e)
        }
    }

    /**
     * Determines if permission rationale should be shown with detailed messaging.
     *
     * @param activity The activity context for rationale check
     * @return Boolean indicating if rationale should be shown
     */
    @JvmStatic
    fun shouldShowRationale(activity: Activity): Boolean {
        if (activity.isFinishing) {
            Log.w(TAG, "Activity is finishing, skipping rationale check")
            return false
        }

        val shouldShow = REQUIRED_PERMISSIONS.any { permission ->
            ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
        }

        Log.d(TAG, "Should show rationale: $shouldShow")
        return shouldShow
    }

    /**
     * Processes permission request results with comprehensive error handling.
     *
     * @param requestCode The request code from onRequestPermissionsResult
     * @param permissions The permissions array from onRequestPermissionsResult
     * @param grantResults The grant results array from onRequestPermissionsResult
     * @return Boolean indicating if all permissions were granted
     */
    @JvmStatic
    fun handlePermissionResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ): Boolean {
        if (requestCode != PERMISSION_REQUEST_CODE) {
            Log.w(TAG, "Unexpected request code: $requestCode")
            return false
        }

        if (grantResults.isEmpty()) {
            Log.w(TAG, "Empty grant results")
            return false
        }

        val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }

        // Update cache with new result
        permissionCache = allGranted
        lastCacheTime = System.currentTimeMillis()

        Log.d(TAG, "Permission result processed. All granted: $allGranted")
        
        // Log individual permission results for debugging
        permissions.zip(grantResults).forEach { (permission, result) ->
            Log.d(TAG, "Permission: $permission, Result: ${if (result == PackageManager.PERMISSION_GRANTED) "GRANTED" else "DENIED"}")
        }

        return allGranted
    }
}