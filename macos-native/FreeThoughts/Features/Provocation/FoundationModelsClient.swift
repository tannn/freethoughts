import ComposableArchitecture
import Foundation

@DependencyClient
struct FoundationModelsClient {
    var isAvailable: @Sendable () async -> Bool = { false }
    var generate: @Sendable (_ prompt: String, _ context: String) async throws -> AsyncThrowingStream<String, Error>
}

extension FoundationModelsClient: DependencyKey {
    // TODO: When building with macOS 26 SDK, replace with real FoundationModels integration.
    // The live value currently returns unavailable since the FoundationModels API
    // requires macOS 26+ and Apple Silicon.
    static let liveValue = FoundationModelsClient(
        isAvailable: { false },
        generate: { _, _ in
            throw FoundationModelsError.notAvailable
        }
    )

    static let testValue = FoundationModelsClient(
        isAvailable: { true },
        generate: { _, _ in
            AsyncThrowingStream { continuation in
                Task {
                    let words = "This is a test provocation response that challenges your thinking.".split(separator: " ")
                    for word in words {
                        try? await Task.sleep(for: .milliseconds(100))
                        continuation.yield(String(word) + " ")
                    }
                    continuation.finish()
                }
            }
        }
    )
}

enum FoundationModelsError: Error, LocalizedError {
    case notAvailable
    case generationFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Apple Foundation Models is not available on this device. macOS 26+ on Apple Silicon is required."
        case .generationFailed(let reason):
            return "AI generation failed: \(reason)"
        }
    }
}

extension DependencyValues {
    var foundationModelsClient: FoundationModelsClient {
        get { self[FoundationModelsClient.self] }
        set { self[FoundationModelsClient.self] = newValue }
    }
}
