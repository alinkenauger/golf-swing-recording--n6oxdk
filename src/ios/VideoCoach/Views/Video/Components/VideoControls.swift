//
// VideoControls.swift
// VideoCoach
//
// SwiftUI video playback controls with design system compliance
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+
import AVKit // built-in

// MARK: - Constants
private enum Constants {
    static let controlHeight: CGFloat = 44.0
    static let playbackRates: [Float] = [0.25, 0.5, 1.0, 1.5, 2.0]
    static let seekInterval: Double = 10.0
    static let minTouchTargetSize: CGFloat = 44.0
    static let sliderTrackHeight: CGFloat = 2.0
    static let sliderThumbSize: CGFloat = 20.0
}

// MARK: - VideoControls View
@available(iOS 14.0, *)
@available(macCatalyst 14.0, *)
struct VideoControls: View {
    // MARK: - Properties
    @Binding var isPlaying: Bool
    @Binding var currentTime: Double
    @Binding var duration: Double
    @Binding var playbackRate: Float
    
    @State private var isShowingSpeedMenu: Bool = false
    @State private var isScrubbing: Bool = false
    @State private var scrubberPosition: Double = 0
    
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Initialization
    init(isPlaying: Binding<Bool>, currentTime: Binding<Double>, 
         duration: Binding<Double>, playbackRate: Binding<Float>) {
        self._isPlaying = isPlaying
        self._currentTime = currentTime
        self._duration = duration
        self._playbackRate = playbackRate
        
        // Set initial scrubber position
        self._scrubberPosition = State(initialValue: currentTime.wrappedValue)
    }
    
    // MARK: - Body
    var body: some View {
        VStack(spacing: UIConfig.spacing["small"]) {
            makeProgressSlider()
                .padding(.horizontal, UIConfig.spacing["medium"])
            
            HStack(spacing: UIConfig.spacing["medium"]) {
                makePlaybackControls()
                makeTimeDisplay()
                Spacer()
                makeSpeedControl()
            }
            .frame(height: Constants.controlHeight)
            .standardPadding()
        }
        .background(
            colorScheme == .dark ? Color.black.opacity(0.7) : Color.white.opacity(0.7)
        )
        .background(.ultraThinMaterial)
        .roundedCorners()
    }
    
    // MARK: - Control Components
    private func makePlaybackControls() -> some View {
        HStack(spacing: UIConfig.spacing["medium"]) {
            // Play/Pause Button
            Button(action: { isPlaying.toggle() }) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
            }
            .accessibilityLabel(isPlaying ? "Pause" : "Play")
            .accessibleTouchTarget()
            
            // Seek Backward Button
            Button(action: { seek(by: -Constants.seekInterval) }) {
                Image(systemName: "gobackward.\(Int(Constants.seekInterval))")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
            }
            .accessibilityLabel("Seek backward \(Int(Constants.seekInterval)) seconds")
            .accessibleTouchTarget()
            
            // Seek Forward Button
            Button(action: { seek(by: Constants.seekInterval) }) {
                Image(systemName: "goforward.\(Int(Constants.seekInterval))")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
            }
            .accessibilityLabel("Seek forward \(Int(Constants.seekInterval)) seconds")
            .accessibleTouchTarget()
        }
    }
    
    private func makeProgressSlider() -> some View {
        Slider(
            value: Binding(
                get: { isScrubbing ? scrubberPosition : currentTime },
                set: { newValue in
                    scrubberPosition = newValue
                    if !isScrubbing {
                        currentTime = newValue
                    }
                }
            ),
            in: 0...max(duration, 0.01)
        )
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isScrubbing {
                        isScrubbing = true
                    }
                }
                .onEnded { _ in
                    currentTime = scrubberPosition
                    isScrubbing = false
                }
        )
        .accessibilityValue(formatTime(currentTime))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                seek(by: 5)
            case .decrement:
                seek(by: -5)
            @unknown default:
                break
            }
        }
    }
    
    private func makeTimeDisplay() -> some View {
        Text("\(formatTime(currentTime)) / \(formatTime(duration))")
            .standardTextStyle(.caption)
            .monospacedDigit()
            .accessibilityLabel("Current time \(formatTime(currentTime)) of \(formatTime(duration))")
    }
    
    private func makeSpeedControl() -> some View {
        Menu {
            ForEach(Constants.playbackRates, id: \.self) { rate in
                Button(action: { playbackRate = rate }) {
                    HStack {
                        Text("\(String(format: "%.2fx", rate))")
                        if abs(playbackRate - rate) < 0.01 {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Text(String(format: "%.2fx", playbackRate))
                .standardTextStyle(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.secondary.opacity(0.2))
                .roundedCorners(4)
        }
        .accessibilityLabel("Playback speed \(String(format: "%.2f", playbackRate)) times")
        .accessibleTouchTarget()
    }
    
    // MARK: - Helper Functions
    private func seek(by interval: Double) {
        let newTime = max(0, min(currentTime + interval, duration))
        currentTime = newTime
        scrubberPosition = newTime
    }
    
    private func formatTime(_ timeInSeconds: Double) -> String {
        let hours = Int(timeInSeconds / 3600)
        let minutes = Int(timeInSeconds.truncatingRemainder(dividingBy: 3600) / 60)
        let seconds = Int(timeInSeconds.truncatingRemainder(dividingBy: 60))
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
        }
    }
}

// MARK: - Preview Provider
#if DEBUG
struct VideoControls_Previews: PreviewProvider {
    static var previews: some View {
        VideoControls(
            isPlaying: .constant(false),
            currentTime: .constant(65),
            duration: .constant(180),
            playbackRate: .constant(1.0)
        )
        .previewLayout(.sizeThatFits)
        .padding()
    }
}
#endif