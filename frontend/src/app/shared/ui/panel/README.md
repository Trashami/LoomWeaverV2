# lw-panel

Reusable panel with typed `title`, `subtitle`, `eyebrow`, `elevated`, `padded`, and `variant` inputs. Actions project through `[panelActions]`; the default slot contains the body.

- `default`: existing panel appearance and section heading.
- `studio`: dark Dashboard-style surface and restrained border.
- `page-header`: compact dark title bar with an `h1`, inline actions, and no divider. Body content remains optional.

Variants are opt-in and own their styling. Pages must not target the panel's internal selectors. All variants support multiple independent instances; headers wrap on narrow screens. Colors use the shared studio tokens.
