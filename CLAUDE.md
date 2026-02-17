See also: .kittify/AGENTS.md

## Architecture
This is a Swift/SwiftUI macOS project using The Composable Architecture (TCA). Key architectural rules:
- Never put SwiftData model classes directly in TCA state — always use value-type replacements
- TCA state must be Equatable and use value types only
- Use conditional compilation (#if) where platform-specific code is needed
- Always verify the Xcode project builds (`xcodebuild`) after making changes

See also: .kittify/AGENTS.md

Focus on macOS app development, ignore files in `electron` directory

## Git / Worktrees 
When working in git worktrees, always verify the current directory with `pwd` before and after any git operations (checkout, rebase, merge). Never use `git checkout` in a worktree — use the worktree's directory directly.


## Code Review
When given review feedback to fix, read the review feedback carefully and enumerate ALL issues before starting any code changes. Use code-reviewer agent when applicable.

## General Behavior 
Minimize exploratory codebase reading when the user provides specific instructions or feedback. Start from the specific files and issues mentioned, and expand only if needed.

## Memory
Read and populate `MEMORY.md` with repo specific-info as helpful context for other session. 

## Development
Use swift-expert agent when applicable.
When given a bug report, first investigate. Create a plan to fix the bug before implementing.