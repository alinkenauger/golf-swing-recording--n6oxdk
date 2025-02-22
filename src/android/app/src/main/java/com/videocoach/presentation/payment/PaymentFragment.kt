package com.videocoach.presentation.payment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.stripe.android.PaymentConfiguration
import com.stripe.android.Stripe
import com.stripe.android.model.PaymentMethod
import com.videocoach.R
import com.videocoach.databinding.FragmentPaymentBinding
import com.videocoach.presentation.base.BaseFragment
import com.firebase.analytics.PaymentAnalytics
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.Currency
import javax.inject.Inject

private const val TAG = "PaymentFragment"
private const val STRIPE_TIMEOUT_MS = 30000L

/**
 * Fragment responsible for handling secure payment processing and subscription management.
 * Implements PCI-compliant payment flows with comprehensive error handling.
 */
@AndroidEntryPoint
class PaymentFragment : BaseFragment<FragmentPaymentBinding>(R.layout.fragment_payment) {

    private val viewModel: PaymentViewModel by viewModels()
    
    @Inject
    lateinit var stripe: Stripe
    
    @Inject
    lateinit var paymentConfig: PaymentConfiguration
    
    @Inject
    lateinit var analytics: PaymentAnalytics

    private var currentPaymentMethod: PaymentMethod? = null

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentPaymentBinding {
        return FragmentPaymentBinding.inflate(inflater, container, false)
    }

    override fun initializeView() {
        setupSecurePaymentForm()
        setupPaymentMethodSelection()
        setupSubscriptionOptions()
        setupTransactionHistory()
        setupAccessibility()
        observePaymentState()
    }

    private fun setupSecurePaymentForm() {
        with(binding) {
            cardInputWidget.setCardValidCallback { isValid, invalidFields ->
                payButton.isEnabled = isValid && invalidFields.isEmpty()
                if (!isValid) {
                    announceForAccessibility(getString(R.string.payment_card_invalid))
                }
            }

            payButton.setOnClickListener {
                processSecurePayment()
            }

            retryButton.setOnClickListener {
                currentPaymentMethod?.let { method ->
                    viewModel.retryPayment(method.id)
                }
            }
        }
    }

    private fun setupPaymentMethodSelection() {
        with(binding) {
            paymentMethodGroup.setOnCheckedChangeListener { _, checkedId ->
                when (checkedId) {
                    R.id.creditCardButton -> {
                        cardInputWidget.visibility = View.VISIBLE
                        announceForAccessibility(getString(R.string.payment_credit_card_selected))
                    }
                    R.id.bankTransferButton -> {
                        cardInputWidget.visibility = View.GONE
                        announceForAccessibility(getString(R.string.payment_bank_transfer_selected))
                    }
                }
            }
        }
    }

    private fun setupSubscriptionOptions() {
        lifecycleScope.launch {
            viewModel.subscriptionState.collectLatest { state ->
                when (state) {
                    is SubscriptionState.Active -> {
                        binding.subscriptionStatus.text = getString(
                            R.string.subscription_active_until,
                            formatDate(state.expiryDate)
                        )
                        binding.subscriptionGroup.visibility = View.GONE
                    }
                    is SubscriptionState.Expired -> {
                        binding.subscriptionStatus.text = getString(R.string.subscription_expired)
                        binding.subscriptionGroup.visibility = View.VISIBLE
                    }
                    is SubscriptionState.None -> {
                        binding.subscriptionGroup.visibility = View.VISIBLE
                    }
                    else -> {
                        binding.subscriptionGroup.visibility = View.GONE
                    }
                }
            }
        }
    }

    private fun setupTransactionHistory() {
        lifecycleScope.launch {
            viewModel.paymentHistory.collectLatest { payments ->
                binding.transactionList.adapter = PaymentHistoryAdapter(
                    payments,
                    onItemClick = { payment ->
                        showPaymentDetails(payment)
                    }
                )
            }
        }
    }

    private fun setupAccessibility() {
        ViewCompat.setAccessibilityDelegate(binding.root, object : AccessibilityDelegateCompat() {
            override fun onInitializeAccessibilityNodeInfo(
                host: View,
                info: AccessibilityNodeInfoCompat
            ) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.addAction(
                    AccessibilityNodeInfoCompat.AccessibilityActionCompat(
                        AccessibilityNodeInfoCompat.ACTION_CLICK,
                        getString(R.string.payment_form_description)
                    )
                )
            }
        })
    }

    private fun processSecurePayment() {
        val amount = binding.amountInput.text.toString().toDoubleOrNull()
        if (amount == null || amount <= 0) {
            showError(getString(R.string.payment_invalid_amount))
            return
        }

        showLoading()
        analytics.logPaymentStarted(amount)

        stripe.createPaymentMethod(binding.cardInputWidget.paymentMethodCreateParams)
            .addOnSuccessListener { paymentMethod ->
                currentPaymentMethod = paymentMethod
                viewModel.processPayment(
                    paymentMethodId = paymentMethod.id,
                    amount = amount,
                    currency = Currency.getInstance("USD").currencyCode,
                    type = ProcessPaymentUseCase.PaymentType.COACHING_SESSION
                )
            }
            .addOnFailureListener { error ->
                hideLoading()
                showError(error.message ?: getString(R.string.payment_processing_error))
                analytics.logPaymentError(error)
            }
    }

    private fun observePaymentState() {
        lifecycleScope.launch {
            viewModel.paymentState.collectLatest { state ->
                when (state) {
                    is PaymentState.Processing -> {
                        showLoading()
                        announceForAccessibility(getString(R.string.payment_processing))
                    }
                    is PaymentState.Success -> {
                        hideLoading()
                        showPaymentSuccess(state.payment)
                        analytics.logPaymentSuccess(state.payment)
                    }
                    is PaymentState.Error -> {
                        hideLoading()
                        showError(state.message)
                        analytics.logPaymentError(state.message)
                    }
                    is PaymentState.Retrying -> {
                        showLoading()
                        announceForAccessibility(
                            getString(R.string.payment_retrying, state.attempt)
                        )
                    }
                    else -> hideLoading()
                }
            }
        }
    }

    private fun showPaymentSuccess(payment: Payment) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.payment_success_title)
            .setMessage(getString(R.string.payment_success_message, payment.formattedAmount()))
            .setPositiveButton(R.string.ok) { dialog, _ ->
                dialog.dismiss()
            }
            .create()
            .show()
    }

    private fun showPaymentDetails(payment: Payment) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.payment_details_title)
            .setMessage(
                getString(
                    R.string.payment_details_message,
                    payment.formattedAmount(),
                    payment.status,
                    formatDate(payment.createdAt)
                )
            )
            .setPositiveButton(R.string.ok) { dialog, _ ->
                dialog.dismiss()
            }
            .apply {
                if (payment.isRefundable()) {
                    setNegativeButton(R.string.refund) { dialog, _ ->
                        dialog.dismiss()
                        initiateRefund(payment)
                    }
                }
            }
            .create()
            .show()
    }

    private fun initiateRefund(payment: Payment) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.refund_confirmation_title)
            .setMessage(getString(R.string.refund_confirmation_message, payment.formattedAmount()))
            .setPositiveButton(R.string.confirm) { dialog, _ ->
                dialog.dismiss()
                // Implement refund logic
            }
            .setNegativeButton(R.string.cancel) { dialog, _ ->
                dialog.dismiss()
            }
            .create()
            .show()
    }

    override fun retryLastAction() {
        currentPaymentMethod?.let { method ->
            viewModel.retryPayment(method.id)
        }
    }

    private fun formatDate(timestamp: Long): String {
        return android.text.format.DateFormat.getDateFormat(requireContext())
            .format(timestamp)
    }

    companion object {
        fun newInstance() = PaymentFragment()
    }
}