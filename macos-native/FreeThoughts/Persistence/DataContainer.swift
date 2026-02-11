import Foundation
import SwiftData
import ComposableArchitecture

enum DataContainer {
    static var schema: Schema {
        Schema([
            Note.self,
            Provocation.self,
            ProvocationPrompt.self
        ])
    }

    static func create() throws -> ModelContainer {
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )
        return try ModelContainer(for: schema, configurations: config)
    }

    static func createForTesting() throws -> ModelContainer {
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: true,
            allowsSave: true
        )
        return try ModelContainer(for: schema, configurations: config)
    }
}

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
    var modelContainer: ModelContainer {
        get { self[ModelContainerKey.self] }
        set { self[ModelContainerKey.self] = newValue }
    }
}
