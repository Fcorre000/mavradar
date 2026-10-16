# Design references

`design-md/` holds 84 DESIGN.md files from [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT, see `design-md/LICENSE`), copied at commit `3b60532` on 2026-10-15. Each folder describes one well-known product's visual system: colors, type, spacing, components.

They are reference material for ideas, like how a mature product handles a pattern. They are not MavRadar's design:

- MavRadar's design lives in `docs/design/SPECS.md` and `docs/design/tokens.json` and always wins.
- Don't copy another brand's identity (its palette, typefaces or signature components) into MavRadar or the blog site.
- Brand colors still have to pass `app/src/constants/__tests__/theme.test.ts`, so nothing borrowed can read as a crossing state.

To refresh: clone the repo and copy its `design-md/` folder over this one.
