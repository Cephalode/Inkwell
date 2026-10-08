## Variant: Ink & Editorial (auth as the paper's front matter)

### Design stance
Treat signing in as the paper's own front matter — dateline, masthead, fleuron, double rules, and a single "Subscribers' entrance" presented as a news item.

### Key choices
- Layout: narrow single column (~680px), newspaper front-matter stack: dateline → masthead → headline+deck → Google entrance
- Typography: Source Serif 4 display + IBM Plex Mono kickers/datelines
- Color: exact Broadsheet tokens (dark default, `html.light` override, ☀ toggle top-right)
- Interaction: Google button runs a spinner → "sketch only" note (OAuth is the one entrance; no guest path)

### Trade-offs
- Strong at: strongest theming/identity match with the Desk Broadsheet homepage
- Weak at: least conventional — users don't expect a newspaper when signing in
