package com.videocoach.presentation.base

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.LayoutRes
import androidx.fragment.app.Fragment // v1.6.1
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope // v2.6.1
import androidx.viewbinding.ViewBinding // v8.1.1
import com.google.android.material.dialog.MaterialAlertDialogBuilder // v1.9.0
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.videocoach.utils.NetworkUtils
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private const val TAG = "BaseFragment"
private const val DIALOG_STATE_KEY = "dialog_state"
private const val ERROR_MESSAGE_KEY = "error_message"
private const val LOADING_STATE_KEY = "loading_state"

/**
 * Abstract base fragment providing comprehensive common functionality for all fragments
 * in the Video Coach application. Implements error handling, accessibility features,
 * and network state management.
 *
 * @param layoutId The layout resource ID for the fragment
 */
abstract class BaseFragment<VB : ViewBinding>(@LayoutRes private val layoutId: Int) : Fragment(layoutId) {

    private var _binding: VB? = null
    protected val binding get() = _binding!!

    private var errorDialog: MaterialAlertDialogBuilder? = null
    private var progressIndicator: CircularProgressIndicator? = null
    private var isDialogShowing = false
    private var currentErrorMessage: String? = null

    protected abstract val viewModel: BaseViewModel
    protected abstract fun getViewBinding(inflater: LayoutInflater, container: ViewGroup?): VB

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        _binding = getViewBinding(inflater, container)
        return binding.root.apply {
            setupAccessibility()
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        savedInstanceState?.let { bundle ->
            isDialogShowing = bundle.getBoolean(DIALOG_STATE_KEY, false)
            currentErrorMessage = bundle.getString(ERROR_MESSAGE_KEY)
        }

        setupBaseObservers()
        initializeView()
        setupNetworkMonitoring()
    }

    /**
     * Abstract method for view initialization to be implemented by child fragments
     */
    protected abstract fun initializeView()

    /**
     * Sets up accessibility features for the fragment
     */
    private fun View.setupAccessibility() {
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = javaClass.simpleName
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }

    /**
     * Sets up base observers for loading, error, and network states
     */
    private fun setupBaseObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { isLoading ->
                if (isLoading) showLoading() else hideLoading()
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.error.collectLatest { error ->
                error?.let { showError(it) }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isNetworkAvailable.collectLatest { isAvailable ->
                handleNetworkState(isAvailable)
            }
        }
    }

    /**
     * Sets up network state monitoring
     */
    private fun setupNetworkMonitoring() {
        context?.let { ctx ->
            if (!NetworkUtils.isNetworkAvailable(ctx)) {
                showError(getString(android.R.string.no_network_error))
            }
        }
    }

    /**
     * Shows loading indicator with accessibility announcement
     */
    protected fun showLoading() {
        if (progressIndicator == null) {
            progressIndicator = CircularProgressIndicator(requireContext()).apply {
                isIndeterminate = true
                contentDescription = getString(android.R.string.loading)
            }
        }
        progressIndicator?.visibility = View.VISIBLE
        announceForAccessibility(getString(android.R.string.loading))
    }

    /**
     * Hides loading indicator with accessibility announcement
     */
    protected fun hideLoading() {
        progressIndicator?.visibility = View.GONE
        announceForAccessibility(getString(android.R.string.loading_complete))
    }

    /**
     * Shows error dialog with accessibility support
     */
    protected fun showError(message: String) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            currentErrorMessage = message
            errorDialog = MaterialAlertDialogBuilder(requireContext())
                .setTitle(getString(android.R.string.error_title))
                .setMessage(message)
                .setPositiveButton(android.R.string.ok) { dialog, _ ->
                    dialog.dismiss()
                    viewModel.clearError()
                }
                .setNegativeButton(android.R.string.retry) { dialog, _ ->
                    dialog.dismiss()
                    retryLastAction()
                }

            errorDialog?.create()?.apply {
                setOnDismissListener { isDialogShowing = false }
                show()
                isDialogShowing = true
            }
            
            announceForAccessibility(message)
        }
    }

    /**
     * Handles network state changes with appropriate UI updates
     */
    private fun handleNetworkState(isAvailable: Boolean) {
        if (!isAvailable) {
            showError(getString(android.R.string.no_network_error))
        }
    }

    /**
     * Retries the last failed action
     */
    protected open fun retryLastAction() {
        // To be implemented by child fragments if needed
    }

    /**
     * Announces a message for accessibility services
     */
    protected fun announceForAccessibility(message: String) {
        binding.root.announceForAccessibility(message)
        binding.root.sendAccessibilityEvent(AccessibilityEvent.TYPE_ANNOUNCEMENT)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(DIALOG_STATE_KEY, isDialogShowing)
        outState.putString(ERROR_MESSAGE_KEY, currentErrorMessage)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        errorDialog = null
        progressIndicator = null
        _binding = null
    }
}