/**
 * Business-side layout.
 *
 * Its only job is to put the language choice in scope for everything under
 * /business, so the Hindi/English toggle on these pages is one shared state
 * rather than a per-page setting. Kept as a server component with no data of
 * its own, so the business routes keep their static shell.
 */

import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
