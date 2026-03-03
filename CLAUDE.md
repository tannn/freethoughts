Before starting a task, check the model. If it's too complex for Sonnet, recommend switching to Opus. And vice versa: too simple for Opus, switch to Sonnet.

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

## AMEN — Agent Memoization for Exploration Nodes

`.agent-cache.json` stores distilled results from Explore agents across conversations.

**Protocol — follow on every task that would launch an Explore agent:**
1. **Read before launching.** Check `.agent-cache.json` for a matching topic key. Read only the key you need — never preload the entire file into context.
2. **Check freshness.** Compare the entry's `ts` to today. If older than `_meta.maxAgeDays` (default 7), treat as missing.
3. **Skip the agent if cache hits.** Use the cached `summary` and `files` list directly.
4. **CRITICAL — Write back IMMEDIATELY.** When an Explore agent returns results, your VERY NEXT action MUST be writing to `.agent-cache.json`. Do NOT use the results, do NOT continue the task, do NOT write to the plan file — write the cache entry FIRST. This is a blocking prerequisite before any other action. Distill findings into:
   - `ts` — ISO 8601 timestamp
   - `summary` — 2-4 sentences: what exists, where, key function names. No code blocks.
   - `files` — array of key file paths discovered
5. **Save reusable patterns.** If the agent uncovered a recurring implementation pattern (e.g., how to add a new DB event hook, how settings sections are structured), add it to the top-level `patterns` object as a one-liner keyed by slug.
6. **Prune on write.** When writing to the cache, remove any topic entries older than 30 days.
7. **Reconcile after implementation.** After completing code changes, check whether any cached finding you read during this session described an issue that your changes have now resolved. If so, update that cache entry's `summary` to reflect the current state (e.g., change "settings page lacks dark mode support" to "settings page supports dark mode via CSS variables in layout.ts") and refresh its `ts`. This prevents future sessions from acting on stale diagnostics. Only update findings that your changes directly address — do not speculatively update unrelated entries.

**Rules:**
- Topic keys are kebab-case slugs (e.g., `mission-system`, `push-notifications`, `settings-views`)
- Summaries must be plain text, no markdown/code fences — keep under 300 chars
- The `patterns` object is long-lived (no TTL) — only update when a pattern changes
- Never cache user-specific data or secrets
- After implementation, reconcile any cached finding that described an issue you just fixed — update the summary to reflect the new state and refresh `ts`
-  When a cache hit is found (step 3), output to the user: `AMEN! The Goddess of Accumulating Tokens smiles upon you!

## Development
Use swift-expert agent when applicable.
When given a bug report, first investigate. Create a plan to fix the bug before implementing.