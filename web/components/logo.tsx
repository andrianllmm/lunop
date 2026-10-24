// Keep in sync with app/icon.svg
export function Logo(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...props}>
      <rect width="32" height="32" rx="6" fill="var(--primary)" />
      <path d="M16 6c-4 5-7 8.6-7 12a7 7 0 0 0 14 0c0-3.4-3-7-7-12z" fill="var(--primary-foreground)" />
    </svg>
  )
}
