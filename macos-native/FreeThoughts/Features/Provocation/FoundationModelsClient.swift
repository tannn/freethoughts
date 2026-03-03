import ComposableArchitecture
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// TCA dependency client wrapping Apple Foundation Models (`FoundationModels` framework).
///
/// `liveValue` is compiled conditionally — on macOS 26+ with Apple Silicon it uses
/// `SystemLanguageModel` and `LanguageModelSession`; on other platforms it returns
/// `false` for availability and throws `FoundationModelsError.notAvailable` on generation.
@DependencyClient
struct FoundationModelsClient {
    /// Returns `true` if the on-device language model is available and ready.
    var isAvailable: @Sendable () async -> Bool = { false }
    /// Streams response chunks for the given prompt as an `AsyncThrowingStream`.
    /// Each yielded `String` is the latest full partial response (not a delta).
    var generate: @Sendable (_ prompt: String) async throws -> AsyncThrowingStream<String, Error>
}

extension FoundationModelsClient: DependencyKey {
    static let liveValue: FoundationModelsClient = {
        #if canImport(FoundationModels)
        return FoundationModelsClient(
            isAvailable: {
                if #available(macOS 26.0, *) {
                    return SystemLanguageModel.default.isAvailable
                }
                return false
            },
            generate: { prompt in
                guard #available(macOS 26.0, *) else {
                    throw FoundationModelsError.notAvailable
                }
                let session = LanguageModelSession()
                return AsyncThrowingStream { continuation in
                    let task = Task {
                        do {
                            let stream = session.streamResponse(to: prompt)
                            for try await partial in stream {
                                continuation.yield(partial.content)
                            }
                            continuation.finish()
                        } catch {
                            continuation.finish(throwing: error)
                        }
                    }
                    continuation.onTermination = { _ in task.cancel() }
                }
            }
        )
        #else
        return FoundationModelsClient(
            isAvailable: { false },
            generate: { _ in
                throw FoundationModelsError.notAvailable
            }
        )
        #endif
    }()

    static let testValue = FoundationModelsClient(
        isAvailable: { true },
        generate: { _ in
            AsyncThrowingStream { continuation in
                let task = Task {
                    let words = "This is a test provocation response that challenges your thinking.".split(separator: " ")
                    for word in words {
                        try? await Task.sleep(for: .milliseconds(100))
                        continuation.yield(String(word) + " ")
                    }
                    continuation.finish()
                }
                continuation.onTermination = { _ in task.cancel() }
            }
        }
    )
}

/// Typed errors thrown by `FoundationModelsClient.generate`.
enum FoundationModelsError: Error, LocalizedError {
    /// The on-device language model is not available (wrong OS version or non-Apple-Silicon Mac).
    case notAvailable
    /// Generation started but failed with the given reason.
    case generationFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Apple Foundation Models is not available on this device. macOS 26 or later on Apple Silicon is required."
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
