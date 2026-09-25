# B — Two-pane study

## Design stance
Nothing should be hidden: the left pane keeps every context card permanently visible beside the chat, each region scrolling independently instead of pushing the page taller. Context first, conversation second — the chat sits on the right.

## Key choices
- Layout: 1fr context rail (mastery card, objectives card with key-points disclosure, session stats + history, video suggestion) + 1.55fr chat column (header rows, transcript, composer). Chat on the right, reading lane at the screen's natural exit point near the composer.
- Each context card is its own region; the session/history card scrolls internally if it outgrows the pane — the page still never scrolls.
- History and session stats, previously below the fold, become permanently visible.

## Trade-offs
- Strong at: zero-hunting context; best use of wide screens; history/stats glanceable mid-session.
- Weak at: transcript gets less width; needs a stacked fallback below ~900px; more chrome on screen during chat.

## Best for
Students who like visible progress/objectives while they work, and wide-screen study sessions.

