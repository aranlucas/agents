# Grocery mobile instructions

- Use Uniwind with Tailwind v4 semantic tokens; do not add NativeWind or basic `StyleSheet.create` styling.
- Prefer the source-owned AniUI and React Native Reusables primitives in `src/components/ui/`. Add registry components selectively, normalize them to app conventions, and do not run `aniui init` over the configured app.
- Use React Hook Form and the shared form adapters for submit flows; keep transient search, selection, disclosure, and focus state local.
- Let Expo Router own native headers and toolbars. Keep CopilotKit, markdown, Clerk, and grocery-commerce behavior in domain components rather than replacing them with generic blocks.
- Default to centered `max-w-3xl` content, `p-4 sm:p-6` gutters, responsive stacking, automatic scroll insets, and at least `min-h-14 min-w-14` for standalone touch targets.
- Verify affected native flows on an emulator, including keyboard avoidance, Android back behavior, accessibility labels, dark mode, reduced motion, and narrow and wide layouts.
