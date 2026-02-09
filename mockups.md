# Free Thoughts v0

## Current UX Mockups

This file is normative for current v0 UI structure only.
Historical wireframes are archived in `mockups.archive.md`.

## 1. Global layout (notes-first)

```text
+----------------------------------------------------------------------------------+
| Top Bar: Workspace | Active Document | [Documents]                               |
+---------------------------------------------+------------------------------------+
| Center Pane                                  | Right Sidebar                      |
| Document Reader                              | Unified Feed                       |
|                                              | (Unassigned + Notes + Provocation) |
+---------------------------------------------+------------------------------------+
| Footer: Status: <state>                                                         |
+----------------------------------------------------------------------------------+
```

Behavior refs:
- Layout/navigation: `FR-020F`, `FR-020G`
- Unified feed + pinned unassigned notes: `FR-026`, `FR-029`, `FR-029A`
- Footer behavior: `FR-029B`, `FR-029C`, `ND-013`
- Sidebar height/scroll: `FR-026A`

## 2. Reader default (blank notes pane)

```text
+---------------------------------------------------------------+------------------+
| Reader content (no persistent left pane)                     | NOTES            |
| Document text                                               | Unassigned       |
|                                                              | (if any)         |
|                                                              | (feed starts empty) |
+---------------------------------------------------------------+------------------+
```

Behavior refs:
- Notes-first shell and one active document: `FR-020`, `FR-020F`
- Unassigned notes visibility: `FR-024A`, `FR-029A`

## 3. Text selection action menu

```text
+---------------------------------------------------------------+------------------+
| ...selected text...                                           | NOTES            |
|            +----------------------------------+               |                  |
|            | [Create note] [Provocation]      |               |                  |
|            +----------------------------------+               |                  |
+---------------------------------------------------------------+------------------+
```

Behavior refs:
- Selection note flow + metadata: `FR-021C`, `FR-021F`, `FR-021E`, `ND-011`
- Selection provocation flow: `FR-042`, `FR-046A`

## 4. Create note overlay composer

```text
+----------------------------------------------------------------------------------+
| (Reader dimmed)                                                                   |
| Selected excerpt                                                                   |
|      +--------------------------------------------------------------+             |
|      | Add a note... (single-line)                                  |             |
|      | [Cancel]                                          [Save note] |             |
|      +--------------------------------------------------------------+             |
+----------------------------------------------------------------------------------+
```

Behavior refs:
- Notes are plain text + autosave after creation/edit: `FR-025`, `FR-028`
- Keep deterministic document anchor model unchanged: `FR-023A`
- Quick-entry single-line input in selection note overlay (spec §7.3)

## 5. Selection-triggered provocation style overlay

```text
+----------------------------------------------------------------------------------+
| (Reader dimmed)                                                                   |
| Selected excerpt                                                                   |
|      +--------------------------------------+                                     |
|      | Style: [Skeptical]  [✓]              |                                     |
|      | [Cancel]                  [Generate] |                                     |
|      +--------------------------------------+                                     |
+----------------------------------------------------------------------------------+
```

Behavior refs:
- Style selector requirements: `FR-046`, `FR-046A`, `FR-047`, `FR-048`
- Additive history behavior: `FR-043`, `FR-044`, `DR-017`
- Overlay dismisses on generate; in-flight placeholder/indicator shown: `FR-030`, `FR-030A`, `ND-013`

## 6. Native PDF behavior

Behavior refs:
- Native PDF/fallback: `FR-020B`, `FR-020C`
- Controllable renderer + deterministic PDF selection anchors: `FR-020D`, `FR-020E`, `FR-021D`, `ND-012`
- PDF renderer replacement must preserve zoom/scroll parity + security/perf baselines: `FR-020G`, `FR-060` to `FR-069`, `NFR-001`
- Zoomed PDF uses horizontal panning/scroll when content exceeds the center-pane width: `FR-020H`
- Mapping failure handling keeps context and supports retry: `ER-014`

## 7. Settings modal (app menu)

```text
+----------------------------------------------------------------------------------+
| Top Nav: Workspace | Active Document                                              |
|                 +-------------------------------------------+                     |
|                 | Settings                                  |                     |
|                 | Auth mode                                 |                     |
|                 | Generation model                          |                     |
|                 | Default provocation style                 |                     |
|                 | Re-import current document                |                     |
|                 | [Cancel]                         [Save]    |                     |
|                 +-------------------------------------------+                     |
+----------------------------------------------------------------------------------+
```

Behavior refs:
- Settings modal flow: `FR-054A` to `FR-054D`, `ND-014`
- Dual-auth controls: `FR-055` to `FR-059`, `FR-088`
- Native app menu entry + shortcut: `FR-054E`
- Re-import action in settings: `FR-054F`

## 8. Shared interaction constraints

- Do not block note editing while AI is active (`FR-021B`, `ER-013`).
- Keep reading context stable across AI completion (`FR-029B`, `ND-013`).
- Keep deterministic feed ordering by document position (`FR-049A`, `ND-010`).
- Selection-anchored notes show excerpt only (no paragraph/offset numbers) (`FR-021E`).

## 9. Note card provocation action

```text
+---------------------------------------------+
| Note card title                    [✨] [x] |
| Note content...                             |
|   Style: [Skeptical] [✓]                    |
|   [Cancel]                      [Generate]  |
|                                             |
+---------------------------------------------+
```

How provocation appears after generation:

```text
+---------------------------------------------+
| Note card title                    [✨] [x] |
| Note content...                             |
|  ---    ---   ---   --- [faint dashed line] |
|   [Display Provocation here]                |
|                                             |
+---------------------------------------------+
```

Behavior refs:
- Note-targeted provocation trigger + placement: `FR-042`, `FR-042A`
- Style selector behavior: `FR-046A`, `FR-048`
