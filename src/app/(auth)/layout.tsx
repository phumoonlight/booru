import type { Metadata } from 'next'

// The login screen has nothing to index — the site is read-only to visitors.
export const metadata: Metadata = {
  title: 'Log in',
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return children
}
