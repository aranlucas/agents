# Repository instructions

- Use `pnpm`; verify with `pnpm check && pnpm test`.
- Use Tailwind's built-in utility scale and shared semantic theme tokens. Do not add arbitrary-value utilities or custom CSS when an existing Tailwind class applies; use Tailwind's typography utilities for font size, weight, line height, and letter spacing.
- Review Go agent changes against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2).
- D1 and R2 are mandatory; do not add alternate persistence. Keep Worker names, bindings, and D1 migration history stable.
- Keep gateway and Telegram images static, non-root, and free of Node or scripting runtimes.
