import { app } from 'electron'

/**
 * How host names are resolved, and why the OS resolver isn't enough.
 *
 * Everything this window fetches from the open web is an address someone dragged out of
 * their browser — and a browser today very often resolves over DNS-over-HTTPS while the
 * machine underneath it still points at whatever DNS the router handed out. So the two
 * disagree: the image sits there in Brave or Firefox, the drag lands here, and the fetch
 * fails with `ERR_NAME_NOT_RESOLVED` for a host the user is *looking at*. An ISP resolver
 * that answers NXDOMAIN for a board it would rather not carry does exactly this, and it
 * is indistinguishable from the site being down unless you know to check.
 *
 * Electron's default is "DoH if the system's own provider supports it", which is no help
 * precisely when the system provider is the problem. Naming the servers instead makes the
 * app resolve the way the browser the image came from does.
 *
 * `secure`, not `automatic`, and that is the whole fix. Automatic only upgrades to DoH
 * "if DoH is available" — Chromium reads that off the system's own DNS provider, which
 * on exactly the networks this matters on is a router-supplied resolver that supports
 * nothing of the sort, so the servers named below were never asked and the lookup fell
 * straight back to the resolver that was refusing it. Secure is what actually sends the
 * query to them.
 *
 * The cost of secure is that there is no plain-DNS fallback left, and the reason that is
 * affordable is how narrow this setting's reach turns out to be: it configures Chromium's
 * network service, which here means the image downloads in `main/download.ts` and
 * whatever the window itself loads. The Supabase clients go through the global `fetch`,
 * which in the main process is Node's own and keeps using the OS resolver. So a network
 * that blocked both providers below would cost browser drags, not the ability to sign in
 * or upload — and picked files, the ordinary path, never resolve anything at all.
 *
 * Two providers because one is a single point of failure, and these two are the ones a
 * browser is most likely to already be using.
 */
const DOH_SERVERS = ['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query']

/** Must be called after `ready`; it configures the network service, not a session. */
export function configureDns(): void {
  app.configureHostResolver({
    // Chromium's own resolver is what speaks DoH — the platform's getaddrinfo can't.
    // Off by default on Windows and Linux, which is where this app runs.
    enableBuiltInResolver: true,
    secureDnsMode: 'secure',
    secureDnsServers: DOH_SERVERS,
  })
}
