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
            guard FileManager.default.fileExists(atPath: url.path) else {
                throw DocumentError.fileNotFound
            }

            guard FileManager.default.isReadableFile(atPath: url.path) else {
                throw DocumentError.accessDenied
            }

            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let fileSize = (attributes[.size] as? NSNumber)?.intValue ?? 0
            let maxSize = 100 * 1024 * 1024
            if fileSize > maxSize {
                throw DocumentError.fileTooLarge
            }

            guard let type = Document.DocumentType.from(url: url) else {
                throw DocumentError.unsupportedFormat
            }

            let content: Document.DocumentContent = try await Task.detached {
                do {
                    switch type {
                    case .pdf:
                        guard let pdfDoc = PDFDocument(url: url) else {
                            throw DocumentError.corrupted
                        }
                        return .pdf(pdfDoc)

                    case .markdown, .plainText:
                        let text = try String(contentsOf: url, encoding: .utf8)
                        return .text(text)
                    }
                } catch let error as DocumentError {
                    throw error
                } catch {
                    throw DocumentError.loadFailed
                }
            }.value

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
    case accessDenied
    case corrupted
    case fileTooLarge

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return "This file format is not supported. Please open a PDF, Markdown (.md), or plain text (.txt) file."
        case .loadFailed:
            return "Failed to load the document. The file may be damaged."
        case .fileNotFound:
            return "The file could not be found. It may have been moved or deleted."
        case .accessDenied:
            return "Permission denied. Please check the file's permissions."
        case .corrupted:
            return "The file appears to be corrupted and cannot be opened."
        case .fileTooLarge:
            return "This file is too large to open. Maximum file size is 100 MB."
        }
    }
}

extension DependencyValues {
    var documentClient: DocumentClient {
        get { self[DocumentClient.self] }
        set { self[DocumentClient.self] = newValue }
    }
}
