import Foundation
import PDFKit

struct Document: Identifiable, Equatable {
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

    enum DocumentType: String, CaseIterable {
        case pdf
        case markdown
        case plainText

        var displayName: String {
            switch self {
            case .pdf: return "PDF"
            case .markdown: return "Markdown"
            case .plainText: return "Plain Text"
            }
        }

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

    enum DocumentContent: Equatable {
        case pdf(PDFDocument)
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
