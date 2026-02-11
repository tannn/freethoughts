import ComposableArchitecture
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

@DependencyClient
struct FoundationModelsClient {
    var isAvailable: @Sendable () async -> Bool = { false }
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
                    Task {
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
