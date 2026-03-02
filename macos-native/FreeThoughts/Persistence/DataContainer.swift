import Foundation
import SwiftData
import ComposableArchitecture

/// Factory namespace for creating the app's SwiftData `ModelContainer`.
///
/// The schema includes `Note`, `Provocation`, and `ProvocationPrompt` models.
/// `createForTesting()` returns an in-memory container suitable for unit tests.
enum DataContainer {
    /// The SwiftData schema containing all persistent model types.
    static var schema: Schema {
        Schema([
            Note.self,
            Provocation.self,
            ProvocationPrompt.self
        ])
    }

    /// Creates and returns the production `ModelContainer` backed by the default store URL.
    static func create() throws -> ModelContainer {
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )
        return try ModelContainer(for: schema, configurations: config)
    }

    /// Creates and returns an in-memory `ModelContainer` for use in tests.
    /// Data is discarded when the container is deallocated.
    static func createForTesting() throws -> ModelContainer {
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: true,
            allowsSave: true
        )
        return try ModelContainer(for: schema, configurations: config)
    }
}

/// TCA dependency key that vends the shared `ModelContainer`.
/// `liveValue` creates the on-disk container; `testValue` creates an in-memory container.
private enum ModelContainerKey: DependencyKey {
    static let liveValue: ModelContainer = {
        do {
            return try DataContainer.create()
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }()

    static let testValue: ModelContainer = {
        do {
            return try DataContainer.createForTesting()
        } catch {
            fatalError("Failed to create test ModelContainer: \(error)")
        }
    }()
}

extension DependencyValues {
    /// The shared SwiftData `ModelContainer` injected via TCA's dependency system.
    var modelContainer: ModelContainer {
        get { self[ModelContainerKey.self] }
        set { self[ModelContainerKey.self] = newValue }
    }
}
