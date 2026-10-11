# C — Immersive stage

## Design stance
The tutor session should feel like stepping into a lesson space: chat center-stage, context in quiet side wings, everything else docked to a slim top bar and bottom dock.

## Key choices
- Layout: three horizontal zones — omnibar (course · title · strategy · mastery · end-session), center stage (transcript flanked by objectives/also-taught wing left, key-points/session wing right), bottom dock (composer + strategy-switcher chip strip).
- Transcript is edge-masked (fade at top/bottom) to signal scrollability without spending chrome on it.
- Strategy chips in the dock mean you can switch to Lesson/Flashcards/Quiz without a page round-trip (currently that's "Back to strategies" → picker).

## Trade-offs
- Strong at: immersion, screen-height economy, one-click strategy switching; feels premium.
- Weak at: most radical departure from the current page; side wings shrink the chat below ~1100px and need a collapse plan; wings fade on hover-only affordance.

## Best for
Long tutoring sessions where the student stays in one strategy and wants everything else quiet.
