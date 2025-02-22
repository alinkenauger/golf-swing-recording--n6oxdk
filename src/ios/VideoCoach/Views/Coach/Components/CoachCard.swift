import SwiftUI

@available(iOS 14.0, *)
struct CoachCard: View {
    // MARK: - Properties
    let coach: Coach
    let onTap: () -> Void
    
    @State private var isPressed: Bool = false
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Constants
    private let cardPadding: CGFloat = 16
    private let cornerRadius: CGFloat = 12
    private let avatarSize: CGFloat = 80
    private let shadowRadius: CGFloat = 8
    private let pressedScale: CGFloat = 0.98
    private let specialtySpacing: CGFloat = 8
    private let verticalSpacing: CGFloat = 12
    
    // MARK: - Body
    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isPressed = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    isPressed = false
                    onTap()
                }
            }
        }) {
            VStack(alignment: .leading, spacing: verticalSpacing) {
                // Avatar and Verification Badge
                UserAvatarView(user: coach, size: avatarSize, showBorder: true)
                    .overlay(
                        Group {
                            if coach.verificationStatus == .verified {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundColor(.blue)
                                    .background(
                                        Circle()
                                            .fill(Color.white)
                                            .padding(-2)
                                    )
                                    .offset(x: 2, y: 2)
                            }
                        }
                    )
                
                // Coach Name
                Text(coach.fullName)
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                
                // Rating and Experience
                HStack(spacing: 4) {
                    Image(systemName: "star.fill")
                        .foregroundColor(.yellow)
                    Text(String(format: "%.1f", coach.rating))
                        .fontWeight(.medium)
                    Text("•")
                        .foregroundColor(.secondary)
                    Text("\(coach.experience) years")
                        .foregroundColor(.secondary)
                }
                .font(.subheadline)
                
                // Specialties
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: specialtySpacing) {
                        ForEach(coach.specialties, id: \.self) { specialty in
                            Text(specialty)
                                .font(.footnote)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    Capsule()
                                        .fill(Color.blue.opacity(0.1))
                                )
                                .foregroundColor(.blue)
                        }
                    }
                }
                
                // Hourly Rate
                Text(formatPrice(coach.hourlyRate))
                    .font(.headline)
                    .foregroundColor(.primary)
            }
            .padding(cardPadding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(colorScheme == .dark ? Color(.systemGray6) : .white)
            )
            .shadow(
                color: Color.black.opacity(0.1),
                radius: shadowRadius,
                x: 0,
                y: 2
            )
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? pressedScale : 1.0)
        .animation(.spring(), value: isPressed)
        // Accessibility
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Double tap to view profile")
        .accessibilityAddTraits(.isButton)
        // Minimum touch target size
        .frame(minWidth: 44, minHeight: 44)
    }
    
    // MARK: - Helper Methods
    private func formatPrice(_ price: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale.current
        
        guard let formattedPrice = formatter.string(from: price as NSDecimalNumber) else {
            return "$\(price)/hr"
        }
        
        return "\(formattedPrice)/hr"
    }
    
    private var accessibilityLabel: String {
        let specialtiesString = coach.specialties.joined(separator: ", ")
        return """
        \(coach.fullName), \
        \(String(format: "%.1f", coach.rating)) stars, \
        \(coach.experience) years experience. \
        Specializes in \(specialtiesString). \
        \(formatPrice(coach.hourlyRate)) per hour. \
        \(coach.verificationStatus == .verified ? "Verified coach." : "")
        """
    }
}

// MARK: - Preview Provider
@available(iOS 14.0, *)
struct CoachCard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Sample coach data for preview
            let sampleCoach = try! Coach(
                id: "preview-1",
                email: "coach@example.com",
                firstName: "John",
                lastName: "Smith",
                specialties: ["Tennis", "Fitness", "Nutrition"],
                certifications: [],
                experience: 10,
                hourlyRate: 75.0,
                availability: ["Monday": []]
            )
            
            // Light mode preview
            CoachCard(coach: sampleCoach, onTap: {})
                .padding()
                .previewLayout(.sizeThatFits)
                .previewDisplayName("Light Mode")
            
            // Dark mode preview
            CoachCard(coach: sampleCoach, onTap: {})
                .padding()
                .previewLayout(.sizeThatFits)
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
            
            // Dynamic Type preview
            CoachCard(coach: sampleCoach, onTap: {})
                .padding()
                .previewLayout(.sizeThatFits)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Large Dynamic Type")
        }
    }
}