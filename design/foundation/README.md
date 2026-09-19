# Foundation

The design system for `apps/web`, v0.1 (2026-09-19). Open `index.html` to see it; read
`.impeccable.md` at the repository root for why it looks this way.

| File | What it is |
|---|---|
| `tokens.css` | Every colour, size, space, radius and duration, as custom properties. Nothing else introduces a value. |
| `base.css` | Element defaults and the primitives: the two voices, the spread, controls, fields, the citation, the evidence strip, the states. |
| `index.html` | The style sheet — every primitive in use with real course content. Also published as an artifact. |

To use it in the web app, load the fonts once in `index.html` and import both files
before anything else:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,300..500;1,7..72,400&display=swap">
```

```css
@import "../../design/foundation/tokens.css";
@import "../../design/foundation/base.css";
```

The ten rules are at the end of `index.html`. The first one is the one to remember: if it
is in the serif, it came from the learner or their material — the product never speaks in
the serif.
