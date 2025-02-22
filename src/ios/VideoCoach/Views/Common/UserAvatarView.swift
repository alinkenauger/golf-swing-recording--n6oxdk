import SwiftUI
import SDWebImageSwiftUI // v2.2.0

@available(iOS 14.0, *)
struct UserAvatarView: View {
    // MARK: - Properties
    let user: User
    let size: CGFloat
    let showBorder: Bool
    
    private let cornerRadius: CGFloat = 8.0
    private let borderWidth: CGFloat = 2.0
    private let placeholderBackgroundColors: [Color] = [.blue, .purple, .indigo]
    
    @State private var isLoading: Bool = false
    @State private var loadError: Error? = nil
    
    // MARK: - Initialization
    init(user: User, size: CGFloat, showBorder: Bool = false) {
        self.user = user
        self.size = max(32, min(size, 256)) // Constrain size between 32 and 256
        self.showBorder = showBorder
    }
    
    // MARK: - Body
    var body: some View {
        Group {
            if let avatarUrl = user.avatarUrl {
                WebImage(url: avatarUrl)
                    .onSuccess { _, _, _ in
                        isLoading = false
                        loadError = nil
                    }
                    .onFailure { error in
                        loadError = error
                        isLoading = false
                    }
                    .onProgress { _, _ in
                        isLoading = true
                    }
                    .resizable()
                    .placeholder {
                        placeholderView()
                            .overlay(
                                Group {
                                    if isLoading {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle())
                                    }
                                }
                            )
                    }
                    .indicator(.activity)
                    .transition(.fade(duration: 0.25))
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                placeholderView()
            }
        }
        .frame(width: size, height: size)
        .overlay(
            Group {
                if showBorder {
                    Circle()
                        .strokeBorder(
                            Color.primary.opacity(0.2),
                            lineWidth: borderWidth
                        )
                }
            }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isImage)
        .contextMenu {
            if loadError != nil {
                Button(action: {
                    loadError = nil
                    isLoading = true
                }) {
                    Label("Retry Loading", systemImage: "arrow.clockwise")
                }
            }
        }
    }
    
    // MARK: - Helper Views
    private func placeholderView() -> some View {
        ZStack {
            Circle()
                .fill(
                    placeholderBackgroundColors[
                        abs(user.id.hashValue) % placeholderBackgroundColors.count
                    ].opacity(0.2)
                )
            
            Text(initialsText)
                .font(.system(size: size * 0.4, weight: .medium, design: .rounded))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: size * 0.8)
        }
        .frame(width: size, height: size)
    }
    
    // MARK: - Helper Methods
    private var initialsText: String {
        let firstInitial = user.firstName.prefix(1).uppercased()
        let lastInitial = user.lastName.prefix(1).uppercased()
        return "\(firstInitial)\(lastInitial)"
    }
    
    private var accessibilityLabel: String {
        if loadError != nil {
            return "Failed to load avatar for \(user.fullName). Double tap to retry."
        } else if isLoading {
            return "Loading avatar for \(user.fullName)"
        } else {
            return "Avatar for \(user.fullName)"
        }
    }
}

// MARK: - Preview Provider
@available(iOS 14.0, *)
struct UserAvatarView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Preview with avatar URL
            let userWithAvatar = try! User(
                id: "1",
                email: "john.doe@example.com",
                firstName: "John",
                lastName: "Doe",
                avatarUrl: URL(string: "https://example.com/avatar.jpg"),
                role: .coach
            )
            
            // Preview with no avatar URL
            let userWithoutAvatar = try! User(
                id: "2",
                email: "jane.smith@example.com",
                firstName: "Jane",
                lastName: "Smith",
                role: .athlete
            )
            
            VStack(spacing: 20) {
                // Different sizes
                HStack(spacing: 20) {
                    UserAvatarView(user: userWithAvatar, size: 40)
                    UserAvatarView(user: userWithAvatar, size: 60)
                    UserAvatarView(user: userWithAvatar, size: 80, showBorder: true)
                }
                
                // Placeholder view
                HStack(spacing: 20) {
                    UserAvatarView(user: userWithoutAvatar, size: 60)
                    UserAvatarView(user: userWithoutAvatar, size: 60, showBorder: true)
                }
            }
            .padding()
            .previewLayout(.sizeThatFits)
            .previewDisplayName("Avatar Variations")
            
            // Dark mode preview
            VStack(spacing: 20) {
                UserAvatarView(user: userWithAvatar, size: 60)
                UserAvatarView(user: userWithoutAvatar, size: 60)
            }
            .padding()
            .previewLayout(.sizeThatFits)
            .preferredColorScheme(.dark)
            .previewDisplayName("Dark Mode")
        }
    }
}