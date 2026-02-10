import Foundation
import SwiftData

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
