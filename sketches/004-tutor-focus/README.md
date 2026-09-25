# A — Focused session

## Design stance
During an assessed session the *conversation* is the screen; everything else is glanceable chrome or hidden until asked for.

## Key choices
- Layout: single slim context strip (course · title · objectives-chip · mastery · known-button) above a chat column that owns all remaining height. Objectives/key-points/also-taught move into a slide-out drawer via the "3 objectives · key points" chip.
- The page never scrolls: `html/body { overflow: hidden }`, main is a flex column, `.transcript` is `flex: 1` + `overflow-y: auto`.
- The composer stays pinned at the bottom and grows to ~130px for long answers before the transcript shrinks.

## Trade-offs
- Strong at: focus, max transcript room, zero page scroll at any laptop height.
- Weak at: objectives/key points are invisible during the session unless you open the drawer (deliberate — the tutor quotes them in assessments anyway).

## Best for
Students who treat the tutor like a conversation and never look back at the sidebar content mid-session.
