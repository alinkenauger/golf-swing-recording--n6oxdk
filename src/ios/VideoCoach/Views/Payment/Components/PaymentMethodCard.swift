import SwiftUI // v14.0+
import Models.Payment

// MARK: - Constants
private enum CardConstants {
    static let cornerRadius: CGFloat = 12.0
    static let padding: CGFloat = 16.0
    static let shadowRadius: CGFloat = 4.0
    static let iconSize: CGFloat = 24.0
    static let spacing: CGFloat = 8.0
    static let defaultBadgeHeight: CGFloat = 20.0
}

// MARK: - PaymentMethodCard View
@available(iOS 14.0, *)
public struct PaymentMethodCard: View {
    // MARK: - Properties
    private let paymentMethod: PaymentMethod
    private let lastFourDigits: String
    private let expiryDate: String?
    private let isDefault: Bool
    
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale
    
    // MARK: - Initialization
    public init(
        paymentMethod: PaymentMethod,
        lastFourDigits: String,
        expiryDate: String? = nil,
        isDefault: Bool = false
    ) {
        self.paymentMethod = paymentMethod
        self.lastFourDigits = lastFourDigits
        self.expiryDate = expiryDate
        self.isDefault = isDefault
    }
    
    // MARK: - Private Methods
    private func paymentMethodIcon() -> some View {
        let icon: Image = {
            switch paymentMethod {
            case .creditCard:
                return Image(systemName: "creditcard.fill")
            case .applePay:
                return Image(systemName: "applepay")
            case .bankTransfer:
                return Image(systemName: "building.columns.fill")
            case .wallet:
                return Image(systemName: "wallet.pass.fill")
            }
        }()
        
        return icon
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: CardConstants.iconSize, height: CardConstants.iconSize)
            .foregroundColor(colorScheme == .dark ? .white : .primary)
            .accessibility(label: Text(paymentMethod.rawValue.localizedCapitalized))
    }
    
    private func formattedExpiryDate() -> String? {
        guard let expiryDate = expiryDate else { return nil }
        
        let dateFormatter = DateFormatter()
        dateFormatter.locale = locale
        dateFormatter.dateFormat = "MM/yy"
        
        return String(
            format: NSLocalizedString("Expires %@", comment: "Payment method expiry date"),
            expiryDate
        )
    }
    
    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: CardConstants.cornerRadius)
            .fill(colorScheme == .dark ? Color(.systemGray6) : .white)
            .shadow(
                color: Color.black.opacity(0.1),
                radius: CardConstants.shadowRadius,
                x: 0,
                y: 2
            )
    }
    
    private var defaultBadge: some View {
        Text("Default")
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .frame(height: CardConstants.defaultBadgeHeight)
            .background(Color.blue)
            .clipShape(Capsule())
            .accessibility(label: Text("Default payment method"))
    }
    
    // MARK: - Body
    public var body: some View {
        VStack(alignment: .leading, spacing: CardConstants.spacing) {
            HStack(spacing: CardConstants.spacing) {
                paymentMethodIcon()
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(paymentMethod.rawValue.localizedCapitalized)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    HStack(spacing: CardConstants.spacing) {
                        Text("•••• \(lastFourDigits)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        
                        if let formattedExpiry = formattedExpiryDate() {
                            Text(formattedExpiry)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Spacer()
                
                if isDefault {
                    defaultBadge
                }
            }
        }
        .padding(CardConstants.padding)
        .background(cardBackground)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(Text("Double tap to select payment method"))
    }
}

// MARK: - Preview Provider
#if DEBUG
@available(iOS 14.0, *)
struct PaymentMethodCard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            PaymentMethodCard(
                paymentMethod: .creditCard,
                lastFourDigits: "4242",
                expiryDate: "12/25",
                isDefault: true
            )
            
            PaymentMethodCard(
                paymentMethod: .applePay,
                lastFourDigits: "0000"
            )
            .preferredColorScheme(.dark)
        }
        .previewLayout(.sizeThatFits)
        .padding()
    }
}
#endif