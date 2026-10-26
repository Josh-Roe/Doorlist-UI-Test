# Doorlist mobile

A phone-sized web interface connected to a user's Doorlist account. The same mobile layout is used at every viewport width.

## Published app

Entry point: https://josh-roe.github.io/Doorlist-UI-Test/

GitHub Pages forwards visitors to the hosted mobile app, where each visitor can connect their own Doorlist account by SMS. The full hosted source is in `hosting/`. Runtime session encryption keys are configured in the hosting service and are not in this repository. Hosted sessions are encrypted, expire after inactivity, and remain separate for each visitor. The hosted version bounds large guest-list responses and clearly labels partial results.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

Open http://127.0.0.1:4173, choose **Connect Doorlist**, and complete SMS sign-in with an existing Doorlist account. The website's existing login is separate from this app's local session. To inspect the original sample interface, choose **View sample UI** in the connection sheet.

The app now needs its Node server; a static Python server or GitHub Pages alone cannot run the connection. Publishing for use from a phone requires an HTTPS host for this server and `PUBLIC_ORIGIN` set to that host's origin. The development server listens only on this computer's loopback address.

## Account and event behavior

The server uses the SMS authentication flow and account endpoints observed in Doorlist's public web client. This is an unofficial integration, so upstream changes can require updates. `doorlist-provider-config.json` contains only the public client configuration published by Doorlist, not a user's credentials.

Your events merges the account's invited events, friends' events, recently available feed events, and discoverable events returned by Doorlist. It removes duplicate and ended events, sorts by date, and preserves **Invited** versus **Discover** labels. Discoverability does not imply an admission invitation. A partial or limited upstream feed is identified rather than presented as a complete successful import.

Each imported event opens its details and guest list when Doorlist permits access. If the guest list is denied or cannot load, the app offers actual profiles from the signed-in account’s encrypted profile dataset, identified as profile suggestions with unconfirmed attendance. It never reuses their RSVP from another event. Preview counts are not presented as actual attendance. Large real lists render in batches of 50 with lazy-loaded photos; the list indicates if Doorlist's response was partial. An accessible empty list remains empty, and an expired account session requires signing in again. RSVP, purchases, access requests, and +1 submissions open the official Doorlist event; this app does not silently perform those account changes.

The ticket screen always uses the generated QR artwork, including for events with accessible admission tickets. It does not request or display official ticket payloads. The main design retains square corner markers and the +1 design retains circular markers. The home screen omits the connection badge, sync status banner, and connection footer; sign-in and manual event refresh remain available from Profile.

Account sessions and imported events are held in server/browser memory. The browser receives an opaque HttpOnly, SameSite session cookie; access and refresh tokens are never returned to the UI or written into source, logs, local storage, or files. Restarting the server requires signing in again. Disconnect clears this app's session and imported events.

## Native-style UI

Home follows the observed Doorlist section order: a swipeable Coming up event carousel, the Your events poster-stack hosting tile, Sway advertisement, Suggested friends, and Get people together. The duplicate Discover list is omitted. Suggested people, attendee circles, and host photos use account-authorized Doorlist responses; unavailable photos use local profile artwork. The Sway card opens the [official ballot-party offer](https://www.sway.co/ballot-party). Event-template and friend actions open Doorlist for the actual account action.

Navigation uses push/back transitions for event pages, slide-up presentation for generated QR screens, and crossfades for tabs. The event background uses Doorlist’s published Purple Confetti video. Reduced motion pauses video playback and disables transitions. Floating controls use translucent blur, saturation, edge highlights, and press feedback informed by [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials). This is a web recreation, not the native system Liquid Glass renderer. The six native Get people together card designs are retained as local images captured from the user-provided native reference; Birthday Party and Study Sesh use the published Purple Confetti and Math videos behind the card foregrounds. The full reference captures stay outside source control. Attendee photo circles overlap and gently float, with reduced-motion support.

## Account profile dataset

The provider keeps up to 500 accessible profiles (account ID, display name, HTTPS picture URL) from the signed-in user’s recommendations and authorized guest lists. The hosted app saves this dataset inside that opaque session’s encrypted D1 record, with the same inactivity expiry. Disconnect removes it. There is no shared cross-account people directory. The authenticated `GET /api/profiles` endpoint exposes only the current session’s dataset; account query parameters cannot select someone else’s cache. Missing guest lists use up to 24 cached people as **profile suggestions**, with attendance unconfirmed; no people or RSVP answers are fabricated. Photos are matched by account ID, without inferring gender from names.

## Source structure

| File | Responsibility |
| --- | --- |
| `server.mjs` | Local HTTP server, SMS sign-in, session and origin boundaries, allowlisted API routes |
| `doorlist-provider.mjs` | Doorlist account/event requests, normal user-authenticated Firestore reads, pagination, QR encoding |
| `guest-list.js` | Pinned self row and stable RSVP-response ordering |
| `avatar.js` | Local profile-image fallback artwork and safe photo selection |
| `event-store.js` | Connected browser repository, loading/error state, refresh and disconnect |
| `demo-store.js` | Explicitly selected sample UI and its local customization |
| `app.js` / `app.css` | Mobile screens, navigation, connection sheet, search, event and guest views |
| `script.js` / `style.css` | Invitation carousel, generated QR artwork, and generated QR artwork |
| `index.html` | App containers and invitation/settings markup |

Routes: `#/`, `#/events`, `#/search`, `#/event/:id`, `#/event/:id/guests`, and `#/event/:id/invite`. Supporting dock destinations are `#/activity` and `#/profile`.

## Validate

```sh
npm test
```

The tests cover deterministic generated guest previews, preservation of real lists, expired sessions, event merging/access distinctions, partial imports, Firestore decoding and pagination, authorization failures, official QR expiry, generated fallback, session protection, and origin boundaries. `tests/ui-fixture.mjs` runs a separate local fixture on port 4174 without contacting Doorlist or sending text messages. Browser checks use that fixture to exercise sign-in → imported event → guest list → QR, including checking that events with official tickets still use the generated artwork.

Live account verification on 2026-10-25 imported 10 events (1 invited, 9 discoverable). All 10 event → QR flows were checked: one official QR and nine generated fallbacks. The official QR refresh and generated guest filtering/search were also checked. This does not establish on-device Safari or physical entry-scanner acceptance.
