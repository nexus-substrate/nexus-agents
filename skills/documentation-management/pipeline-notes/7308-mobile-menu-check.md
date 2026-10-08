PIPELINE NOTE: #7308 adds a "Mobile menu keyboard, focus and inert behaviour"
step to the blocking `accessibility` job in `.github/workflows/deploy-website.yml`.
It runs `pnpm --dir website menu-check` (`website/scripts/menu-check.mjs`) against
the built site in both themes. The check opens and closes the narrow-viewport
navigation drawer by click, Enter, Escape, Close and backdrop. It asserts focus
moves into the drawer and returns to the Menu button, Tab stays contained,
`aria-expanded` and `aria-controls` are truthful, the background is inert and
scroll-locked, targets are at least 48px and the no-JavaScript fallback keeps
navigation reachable. It also runs axe on the open drawer. Like the axe crawl,
it runs on pull requests as well as on pushes to main.
