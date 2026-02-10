import ComposableArchitecture
import SwiftData

extension DependencyValues {
    var modelContainer: ModelContainer {
        get { self[ModelContainerKey.self] }
        set { self[ModelContainerKey.self] = newValue }
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
