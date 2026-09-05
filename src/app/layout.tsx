import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // Absolute base for every relative canonical / OG image below this layout
  metadataBase: new URL(siteUrl()),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // Nothing is set on <html> before paint any more. The adult tiers used to arrive
    // blurred, which meant a script in <head> and an attribute the CSS keyed off; they
    // are now simply absent from the listing unless the NSFW cookie says otherwise, and
    // a row that was never rendered needs nothing hidden.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Navigation lives in the sticky SearchHeader each page renders */}
        <main className="flex-1 pb-8">{children}</main>
      </body>
    </html>
  )
}
