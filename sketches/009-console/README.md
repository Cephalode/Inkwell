## Variant 009 — Console

### Design stance
An instrument panel for studying: monospace system-font chrome, bordered panels in a 12-column grid, status bar with live metrics. The data is the decoration. Linear/retro-terminal energy grafted onto the Broadsheet palette.

### Key choices
- Layout: 12-col grid of panels — Next action (8 cols), Streak/XP/Due stat cells, Courses table, Deadline queue, SRS scheduler with forecast, Ingest dropzone, Event log, 18-week activity heatmap
- Typography: IBM Plex Mono for everything structural; Source Serif only for the two display numbers and panel headlines
- Color: Broadsheet tokens; status colors (green ok, amber warn, pink overdue)
- Interaction: Next-action cycler (Start/Skip), deterministic heatmaps, hover states throughout; ⌘K affordance in status bar
- Density: high but modular — panels can be added/removed per feature

### Trade-offs
- Strong at: total situational awareness; every subsystem visible in one viewport; maps 1:1 to real data (streaks, XP, SRS queue, deadlines)
- Weak at: most opinionated aesthetic — mono can feel cold next to the serif app; most panels to build

### Best for
Power users tracking many courses/deadlines who want a command center.
