import ComposableArchitecture
import Foundation
import PDFKit

@DependencyClient
struct DocumentClient {
    var loadDocument: @Sendable (_ url: URL) async throws -> Document
    var getTextContent: @Sendable (_ document: Document) async -> String?
}

extension DocumentClient: DependencyKey {
    static let liveValue = DocumentClient(
        loadDocument: { url in
            guard let type = Document.DocumentType.from(url: url) else {
                throw DocumentError.unsupportedFormat
            }

            let content: Document.DocumentContent
            switch type {
            case .pdf:
                guard let pdfDoc = PDFDocument(url: url) else {
                    throw DocumentError.loadFailed
                }
                content = .pdf(pdfDoc)

            case .markdown, .plainText:
                let text = try String(contentsOf: url, encoding: .utf8)
                content = .text(text)
            }

            return Document(
                id: UUID(),
                url: url,
                type: type,
                content: content
            )
        },
        getTextContent: { document in
            switch document.content {
            case .pdf(let pdfDoc):
                return pdfDoc.string
            case .text(let text):
                return text
            }
        }
    )

    static let testValue = DocumentClient(
        loadDocument: { _ in
            Document(
                id: UUID(),
                url: URL(fileURLWithPath: "/test.txt"),
                type: .plainText,
                content: .text("Test content")
            )
        },
        getTextContent: { _ in "Test content" }
    )
}

enum DocumentError: Error, LocalizedError {
    case unsupportedFormat
    case loadFailed
    case fileNotFound

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return "This file format is not supported."
        case .loadFailed:
            return "Failed to load the document."
        case .fileNotFound:
            return "The file could not be found."
        }
    }
}

extension DependencyValues {
    var documentClient: DocumentClient {
        get { self[DocumentClient.self] }
        set { self[DocumentClient.self] = newValue }
    }
}
