package com.videocoach.presentation.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.core.view.isVisible
import androidx.fragment.app.viewModels
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.videocoach.R
import com.videocoach.databinding.FragmentProfileBinding
import com.videocoach.domain.models.User
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.Constants
import com.videocoach.utils.NetworkUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "ProfileFragment"
private const val KEY_EDIT_MODE = "profile_edit_mode"
private const val MIN_TOUCH_TARGET_SIZE = 48 // dp
private const val PROFILE_IMAGE_SIZE = 120 // dp

/**
 * Fragment handling the user profile screen with enhanced security, accessibility,
 * and state management features.
 */
@AndroidEntryPoint
class ProfileFragment : BaseFragment<FragmentProfileBinding>(R.layout.fragment_profile) {

    private val viewModel: ProfileViewModel by viewModels()
    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!

    @Inject
    lateinit var savedStateHandle: SavedStateHandle

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupAccessibility()
        initializeView()
        setupStateObservers()
    }

    private fun setupAccessibility() {
        with(binding) {
            root.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            root.contentDescription = getString(R.string.profile_screen_description)

            profileImage.apply {
                contentDescription = getString(R.string.profile_image_description)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            }

            editProfileButton.apply {
                minHeight = resources.getDimensionPixelSize(R.dimen.min_touch_target_size)
                contentDescription = getString(R.string.edit_profile_button_description)
            }

            logoutButton.apply {
                minHeight = resources.getDimensionPixelSize(R.dimen.min_touch_target_size)
                contentDescription = getString(R.string.logout_button_description)
            }
        }
    }

    override fun initializeView() {
        setupProfileImage()
        setupEditButton()
        setupLogoutButton()
        setupRefreshLayout()
    }

    private fun setupProfileImage() {
        binding.profileImage.apply {
            setOnClickListener {
                if (viewModel.isEditMode.value) {
                    handleProfileImageUpdate()
                }
            }
        }
    }

    private fun setupEditButton() {
        binding.editProfileButton.apply {
            setOnClickListener {
                viewModel.toggleEditMode()
                announceForAccessibility(
                    if (viewModel.isEditMode.value) {
                        getString(R.string.edit_mode_enabled)
                    } else {
                        getString(R.string.edit_mode_disabled)
                    }
                )
            }
        }
    }

    private fun setupLogoutButton() {
        binding.logoutButton.apply {
            setOnClickListener {
                showLogoutConfirmation()
            }
        }
    }

    private fun setupRefreshLayout() {
        binding.swipeRefreshLayout.apply {
            setOnRefreshListener {
                viewModel.refreshProfile()
            }
        }
    }

    private fun setupStateObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.uiState.collectLatest { state ->
                when (state) {
                    is ProfileUiState.Loading -> {
                        showLoading()
                        announceForAccessibility(getString(R.string.loading_profile))
                    }
                    is ProfileUiState.Success -> {
                        hideLoading()
                        updateProfileUI(state.user)
                        binding.swipeRefreshLayout.isRefreshing = false
                    }
                    is ProfileUiState.Error -> {
                        hideLoading()
                        showError(state.message)
                        binding.swipeRefreshLayout.isRefreshing = false
                    }
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isEditMode.collectLatest { isEditMode ->
                updateEditModeUI(isEditMode)
            }
        }
    }

    private fun updateProfileUI(user: User) {
        with(binding) {
            nameTextView.text = user.name
            emailTextView.text = user.email.value
            roleTextView.text = user.role.toString()
            statusTextView.text = user.status.toString()

            // Load profile image securely
            Glide.with(this@ProfileFragment)
                .load(user.profileImageUrl)
                .diskCacheStrategy(DiskCacheStrategy.NONE)
                .skipMemoryCache(true)
                .placeholder(R.drawable.profile_placeholder)
                .error(R.drawable.profile_error)
                .into(profileImage)

            // Update accessibility labels
            profileImage.contentDescription = getString(
                R.string.profile_image_description_with_name,
                user.name
            )

            // Show/hide coach-specific features
            coachFeaturesGroup.isVisible = user.isCoach
        }
    }

    private fun updateEditModeUI(isEditMode: Boolean) {
        with(binding) {
            nameTextView.isEnabled = isEditMode
            emailTextView.isEnabled = false // Email cannot be edited
            profileImage.isEnabled = isEditMode
            
            editProfileButton.setText(
                if (isEditMode) R.string.save_profile 
                else R.string.edit_profile
            )

            // Update accessibility states
            nameTextView.importantForAccessibility = if (isEditMode) {
                View.IMPORTANT_FOR_ACCESSIBILITY_YES
            } else {
                View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
        }
    }

    private fun handleProfileImageUpdate() {
        // Implement secure image selection and upload
        // This is a placeholder for the actual implementation
    }

    private fun showLogoutConfirmation() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.logout_confirmation_title)
            .setMessage(R.string.logout_confirmation_message)
            .setPositiveButton(R.string.logout) { _, _ ->
                handleLogout()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun handleLogout() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.logout()
                .onSuccess {
                    // Navigate to login screen
                    // This would be handled by the navigation component
                }
                .onFailure { error ->
                    showError(error.message ?: getString(R.string.logout_error))
                }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_EDIT_MODE, viewModel.isEditMode.value)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        fun newInstance() = ProfileFragment()
    }
}