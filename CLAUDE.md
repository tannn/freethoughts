See also: .kittify/AGENTS.md

Focus on macOS app development, ignore files in `electron` directory

When building xcode project skipMacroValidation may be needed:
```
xcodebuild -project macos-native/FreeThoughts.xcodeproj -scheme FreeThoughts -configuration Debug build -skipMacroValidation 2>&1
```


<!-- Ignore this stuff # Agent Team workflow
- Reviewer: Check if any tasks need review: `/spec-kitty.review`
- Implementor: check if tasks are ready to implement: `/spec-kitty.implement`
- Orchestator:  -->