import Foundation
import PDFKit

/// Value-type representation of an open document.
///
/// `@unchecked Sendable` is required because `PDFDocument` is a reference type that does not
/// conform to `Sendable`; callers must ensure cross-actor access is properly guarded.
struct Document: Identifiable, Equatable, @unchecked Sendable {
    let id: UUID
    let url: URL
    let type: DocumentType
    let content: DocumentContent

    var fileName: String {
        url.lastPathComponent
    }

    var canonicalPath: String {
        url.standardizedFileURL.path
    }

    /// The supported file formats the app can open.
    enum DocumentType: String, CaseIterable {
        case pdf
        case markdown
        case plainText

        /// A localised display string for the document type.
        var displayName: String {
            switch self {
            case .pdf: return "PDF"
            case .markdown: return "Markdown"
            case .plainText: return "Plain Text"
            }
        }

        /// Infers the document type from the file URL's extension, or returns `nil` for unsupported formats.
        static func from(url: URL) -> DocumentType? {
            switch url.pathExtension.lowercased() {
            case "pdf":
                return .pdf
            case "md", "markdown":
                return .markdown
            case "txt", "text":
                return .plainText
            default:
                return nil
            }
        }
    }

    /// The parsed content of a document.
    enum DocumentContent: Equatable {
        /// A loaded `PDFDocument` object.
        case pdf(PDFDocument)
        /// The full plain or Markdown text string.
        case text(String)

        static func == (lhs: DocumentContent, rhs: DocumentContent) -> Bool {
            switch (lhs, rhs) {
            case (.pdf(let a), .pdf(let b)):
                return a.documentURL == b.documentURL
            case (.text(let a), .text(let b)):
                return a == b
            default:
                return false
            }
        }
    }
}
