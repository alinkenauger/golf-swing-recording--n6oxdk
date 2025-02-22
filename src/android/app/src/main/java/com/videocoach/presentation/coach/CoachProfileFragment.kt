package com.videocoach.presentation.coach

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment // v1.6.1
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout // v1.2.0
import com.github.mikephil.charting.charts.LineChart // v3.1.0
import com.github.mikephil.charting.data.Entry
import com.github.mikephil.charting.data.LineData
import com.github.mikephil.charting.data.LineDataSet
import com.videocoach.R
import com.videocoach.databinding.FragmentCoachProfileBinding
import com.videocoach.domain.models.Coach
import com.videocoach.domain.models.Earnings
import com.videocoach.presentation.base.BaseFragment
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject
import java.text.NumberFormat
import java.util.Currency
import timber.log.Timber

/**
 * Fragment displaying comprehensive coach profile information including earnings analytics,
 * subscription tiers, and real-time performance metrics.
 */
@AndroidEntryPoint
class CoachProfileFragment : BaseFragment<FragmentCoachProfileBinding>(R.layout.fragment_coach_profile) {

    @Inject
    lateinit var viewModel: CoachProfileViewModel

    private var earningsChart: LineChart? = null
    private val currencyFormatter = NumberFormat.getCurrencyInstance().apply {
        currency = Currency.getInstance("USD")
    }

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentCoachProfileBinding {
        return FragmentCoachProfileBinding.inflate(inflater, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupViews()
        observeViewModelState()
    }

    private fun setupViews() {
        with(binding) {
            // Setup SwipeRefreshLayout
            swipeRefresh.setOnRefreshListener {
                viewModel.refreshData()
            }

            // Setup earnings chart
            earningsChart = chartEarnings.apply {
                description.isEnabled = false
                setTouchEnabled(true)
                isDragEnabled = true
                setScaleEnabled(true)
                setPinchZoom(true)
                setDrawGridBackground(false)
                axisRight.isEnabled = false
                legend.isEnabled = true
                animateX(1000)
            }

            // Setup subscription tiers recycler
            recyclerSubscriptionTiers.apply {
                adapter = SubscriptionTierAdapter { tier ->
                    // Handle tier selection
                    announceForAccessibility(
                        getString(R.string.subscription_tier_selected, tier.name)
                    )
                }
                setHasFixedSize(true)
            }

            // Setup performance metrics grid
            gridPerformanceMetrics.apply {
                adapter = PerformanceMetricsAdapter()
                setHasFixedSize(true)
            }

            // Setup accessibility
            setupAccessibility()
        }
    }

    private fun observeViewModelState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.coachProfile.collectLatest { coach ->
                coach?.let { updateCoachProfile(it) }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.earnings.collectLatest { earnings ->
                earnings?.let { updateEarningsUI(it) }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.subscriptionTiers.collectLatest { tiers ->
                (binding.recyclerSubscriptionTiers.adapter as? SubscriptionTierAdapter)?.submitList(tiers)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.networkState.collectLatest { state ->
                handleNetworkState(state)
            }
        }
    }

    private fun updateCoachProfile(coach: Coach) {
        with(binding) {
            textCoachName.text = coach.name
            textBio.text = coach.bio
            textExperience.text = getString(
                R.string.years_experience,
                coach.yearsOfExperience
            )
            textRating.text = String.format("%.1f", coach.rating)
            textReviewCount.text = getString(
                R.string.review_count,
                coach.reviewCount
            )
            textStudentCount.text = getString(
                R.string.student_count,
                coach.studentCount
            )

            // Update verification badge
            imageVerificationBadge.visibility =
                if (coach.isVerified) View.VISIBLE else View.GONE

            // Update specialties chips
            chipGroupSpecialties.removeAllViews()
            coach.specialties.forEach { specialty ->
                chipGroupSpecialties.addChip(specialty)
            }
        }
    }

    private fun updateEarningsUI(earnings: Earnings) {
        // Update earnings summary
        with(binding) {
            textLifetimeEarnings.text = currencyFormatter.format(earnings.lifetime)
            textMonthlyEarnings.text = currencyFormatter.format(earnings.monthly)
            textProjectedAnnual.text = currencyFormatter.format(earnings.projectedAnnual)

            // Update trend indicator
            val trendPercentage = earnings.monthlyTrend * 100
            textEarningsTrend.text = String.format("%+.1f%%", trendPercentage)
            textEarningsTrend.setTextColor(
                resources.getColor(
                    if (trendPercentage >= 0) R.color.trend_positive else R.color.trend_negative,
                    null
                )
            )
        }

        // Update earnings chart
        updateEarningsChart(earnings)
    }

    private fun updateEarningsChart(earnings: Earnings) {
        val entries = earnings.revenueByTier.map { (tierId, revenue) ->
            Entry(tierId.hashCode().toFloat(), revenue.toFloat())
        }

        val dataSet = LineDataSet(entries, getString(R.string.monthly_revenue)).apply {
            color = resources.getColor(R.color.chart_line, null)
            setCircleColor(resources.getColor(R.color.chart_point, null))
            lineWidth = 2f
            circleRadius = 4f
            setDrawValues(true)
            valueTextSize = 10f
            mode = LineDataSet.Mode.CUBIC_BEZIER
        }

        earningsChart?.data = LineData(dataSet)
        earningsChart?.invalidate()
    }

    private fun handleNetworkState(state: CoachProfileViewModel.NetworkState) {
        when (state) {
            CoachProfileViewModel.NetworkState.LOADING -> {
                binding.swipeRefresh.isRefreshing = true
            }
            CoachProfileViewModel.NetworkState.SUCCESS -> {
                binding.swipeRefresh.isRefreshing = false
            }
            CoachProfileViewModel.NetworkState.ERROR -> {
                binding.swipeRefresh.isRefreshing = false
                showError(getString(R.string.error_loading_profile))
            }
            else -> {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun setupAccessibility() {
        with(binding) {
            textCoachName.contentDescription = getString(R.string.coach_name_description)
            textBio.contentDescription = getString(R.string.coach_bio_description)
            earningsChart?.contentDescription = getString(R.string.earnings_chart_description)
            recyclerSubscriptionTiers.contentDescription = getString(R.string.subscription_tiers_description)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        earningsChart = null
    }

    companion object {
        fun newInstance(coachId: String): CoachProfileFragment {
            return CoachProfileFragment().apply {
                arguments = Bundle().apply {
                    putString("coachId", coachId)
                }
            }
        }
    }
}