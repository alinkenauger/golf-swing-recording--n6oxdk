import SwiftUI // v14.0+
import Combine // v14.0+

// MARK: - Constants
private enum PaymentViewConstants {
    static let spacing: CGFloat = 16.0
    static let cornerRadius: CGFloat = 12.0
    static let minimumTapArea: CGFloat = 44.0
    static let loadingOpacity: Double = 0.6
    static let maxAmountLength: Int = 10
    static let animationDuration: Double = 0.3
}

// MARK: - PaymentView
@available(iOS 14.0, *)
@MainActor
public struct PaymentView: View {
    // MARK: - Properties
    @StateObject private var viewModel: PaymentViewModel
    @State private var selectedPaymentMethod: PaymentMethod = .creditCard
    @State private var amount: String = ""
    @State private var showingPaymentSheet: Bool = false
    @State private var isProcessing: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showingSuccessAlert: Bool = false
    
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale
    @Environment(\.presentationMode) private var presentationMode
    
    // MARK: - Initialization
    public init() {
        let analyticsService = AnalyticsService.shared
        _viewModel = StateObject(wrappedValue: PaymentViewModel(
            paymentService: PaymentService(
                apiKey: "YOUR_API_KEY",
                publishableKey: "YOUR_PUBLISHABLE_KEY",
                analytics: analyticsService
            ),
            analyticsService: analyticsService
        ))
    }
    
    // MARK: - Private Views
    private var paymentMethodSection: some View {
        VStack(alignment: .leading, spacing: PaymentViewConstants.spacing) {
            Text("Payment Method")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            
            ForEach([PaymentMethod.creditCard, .applePay, .bankTransfer]) { method in
                PaymentMethodCard(
                    paymentMethod: method,
                    lastFourDigits: method == selectedPaymentMethod ? "4242" : "••••",
                    expiryDate: method == selectedPaymentMethod ? "12/25" : nil,
                    isDefault: method == selectedPaymentMethod
                )
                .onTapGesture {
                    withAnimation(.easeInOut(duration: PaymentViewConstants.animationDuration)) {
                        selectedPaymentMethod = method
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }
                .accessibilityHint("Double tap to select \(method.rawValue)")
            }
        }
        .padding()
        .background(colorScheme == .dark ? Color(.systemGray6) : .white)
        .cornerRadius(PaymentViewConstants.cornerRadius)
    }
    
    private var paymentAmountSection: some View {
        VStack(alignment: .leading, spacing: PaymentViewConstants.spacing) {
            Text("Amount")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            
            HStack {
                Text(locale.currencySymbol ?? "$")
                    .font(.title2)
                    .foregroundColor(.secondary)
                
                TextField("0.00", text: $amount)
                    .font(.title2)
                    .keyboardType(.decimalPad)
                    .onChange(of: amount) { newValue in
                        if newValue.count > PaymentViewConstants.maxAmountLength {
                            amount = String(newValue.prefix(PaymentViewConstants.maxAmountLength))
                        }
                    }
                    .accessibilityLabel("Payment amount")
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(PaymentViewConstants.cornerRadius)
        }
        .padding()
    }
    
    private var paymentButton: some View {
        Button(action: processPayment) {
            HStack {
                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Text("Pay")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: PaymentViewConstants.minimumTapArea)
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(PaymentViewConstants.cornerRadius)
            .opacity(isProcessing ? PaymentViewConstants.loadingOpacity : 1)
        }
        .disabled(isProcessing || amount.isEmpty)
        .padding()
        .accessibilityLabel(isProcessing ? "Processing payment" : "Pay")
        .accessibilityHint("Double tap to process payment")
    }
    
    private var paymentHistorySection: some View {
        VStack(alignment: .leading, spacing: PaymentViewConstants.spacing) {
            Text("Payment History")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            
            if viewModel.payments.isEmpty {
                Text("No payment history")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                ScrollView {
                    LazyVStack(spacing: PaymentViewConstants.spacing) {
                        ForEach(viewModel.payments, id: \.id) { payment in
                            PaymentHistoryRow(payment: payment)
                        }
                    }
                }
            }
        }
        .padding()
    }
    
    // MARK: - Private Methods
    private func processPayment() {
        guard let amountDouble = Double(amount) else { return }
        
        isProcessing = true
        errorMessage = nil
        
        Task {
            do {
                let payment = try await viewModel.processPayment(
                    amount: amountDouble,
                    currency: locale.currencyCode ?? "USD",
                    paymentMethod: selectedPaymentMethod
                )
                
                await MainActor.run {
                    isProcessing = false
                    showingSuccessAlert = true
                    amount = ""
                }
            } catch {
                await MainActor.run {
                    isProcessing = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    // MARK: - Body
    public var body: some View {
        ScrollView {
            VStack(spacing: PaymentViewConstants.spacing) {
                paymentMethodSection
                paymentAmountSection
                paymentButton
                paymentHistorySection
            }
        }
        .navigationTitle("Payment")
        .alert(isPresented: $showingSuccessAlert) {
            Alert(
                title: Text("Payment Successful"),
                message: Text("Your payment has been processed successfully."),
                dismissButton: .default(Text("OK"))
            )
        }
        .alert(item: Binding(
            get: { errorMessage.map { PaymentError.processingFailed } },
            set: { _ in errorMessage = nil }
        )) { _ in
            Alert(
                title: Text("Payment Failed"),
                message: Text(errorMessage ?? "An unknown error occurred"),
                dismissButton: .default(Text("OK"))
            )
        }
        .onChange(of: viewModel.isProcessing) { newValue in
            isProcessing = newValue
        }
    }
}

// MARK: - PaymentHistoryRow
private struct PaymentHistoryRow: View {
    let payment: Payment
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(payment.formattedAmount())
                    .font(.headline)
                Text(payment.status.rawValue.localizedCapitalized)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Text(payment.createdAt, style: .date)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(PaymentViewConstants.cornerRadius)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Payment of \(payment.formattedAmount()) on \(payment.createdAt, style: .date)")
    }
}

#if DEBUG
@available(iOS 14.0, *)
struct PaymentView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            PaymentView()
        }
    }
}
#endif