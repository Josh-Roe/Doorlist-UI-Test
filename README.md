# Doorlist mobile

A phone-sized web interface connected to a user's Doorlist account. The same mobile layout is used at every viewport width.

## Published app

Entry point: https://josh-roe.github.io/Doorlist-UI-Test/

GitHub Pages forwards visitors to the hosted mobile app, where each visitor can connect their own Doorlist account by SMS. The full hosted source is in `hosting/`. Runtime session encryption keys are configured in the hosting service and are not in this repository. Hosted sessions are encrypted, expire after inactivity, and remain separate for each visitor. The hosted version bounds individual guest-list responses and follows pagination automatically.

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

Each imported event opens its details and guest list when Doorlist permits access. If the guest list is denied or cannot load, the app offers actual profiles from the signed-in account’s encrypted profile dataset, with no RSVP inferred from their presence in the cache. It never reuses their RSVP from another event. Preview counts are not presented as actual attendance. Large real lists render in batches of 60 with lazy-loaded photos and load further pages automatically. An accessible empty list remains empty, and an expired account session requires signing in again. The RSVP sheet uses the event’s theme and saves the signed-in user’s selected response and optional comment. Purchases, access requests, and +1 submissions open the official Doorlist event.

The ticket screen always uses the generated QR artwork, including for events with accessible admission tickets. It does not request or display official ticket payloads. The main design retains square corner markers and the +1 design retains circular markers. The home screen omits the connection badge, sync status banner, and connection footer; sign-in and manual event refresh remain available from Profile.

Account sessions are stored encrypted on the hosted server. A browser snapshot of the signed-in account’s events, loaded guest lists and accessible profile photos is saved locally for up to 12 hours, so reopening shows the last view immediately while authentication and a full refresh run in the background. A failed refresh keeps cached data visible. Disconnect, account switching and an expired session clear the browser snapshot. The authenticated session endpoint also returns the server’s last snapshot without waiting for Doorlist. The browser receives an opaque HttpOnly, SameSite session cookie; access and refresh tokens are never returned to the UI or written into source, logs, local storage, or files. Restarting the local development server requires signing in again; hosted sessions persist across deployments. Disconnect clears this app's session and imported events.

## Native-style UI

Home follows the observed Doorlist section order: a swipeable Coming up event carousel, the Your events poster-stack hosting tile, Sway advertisement, Suggested friends, and Get people together. The duplicate Discover list is omitted. Suggested people, attendee circles, and host photos use account-authorized Doorlist responses; unavailable photos use local profile artwork. The Sway card opens the [official ballot-party offer](https://www.sway.co/ballot-party). Event-template and friend actions open Doorlist for the actual account action.

Navigation uses push/back transitions for event pages, slide-up presentation for generated QR screens, and crossfades for tabs. The event background uses Doorlist’s published Purple Confetti video. Reduced motion pauses video playback and disables transitions. Floating controls use translucent blur, saturation, edge highlights, and press feedback informed by [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials). This is a web recreation, not the native system Liquid Glass renderer. The six native Get people together card designs are retained as local images captured from the user-provided native reference; Birthday Party and Study Sesh use the published Purple Confetti and Math videos behind the card foregrounds. The full reference captures stay outside source control. Attendee photo circles overlap and gently float, with reduced-motion support.

## Account profile dataset

The provider keeps up to 500 accessible profiles (account ID, display name, HTTPS picture URL) from the signed-in user’s recommendations and authorized guest lists. The hosted app saves this dataset inside that opaque session’s encrypted D1 record, with the same inactivity expiry. Disconnect removes it. There is no shared cross-account people directory. The authenticated `GET /api/profiles` endpoint exposes only the current session’s dataset; account query parameters cannot select someone else’s cache. Missing guest lists use up to 24 cached people. Their underlying RSVP stays unconfirmed, while deterministic display-only Going/Maybe badges use an approximately 8:1 mix. These badges never write an RSVP, enter real attendance counts, or carry answers between events. The visible going count comes from Doorlist’s count or actual loaded RSVP responses, never the profile-cache size. Photos are matched by account ID, without inferring gender from names.

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

Event imports merge the account feed, friends, home feed, trending, account profile events, events explicitly returned by the account’s group memberships, and public events at the school recorded on the signed-in Doorlist profile. Campus reads filter public visibility and school on the server, follow document cursors, and honor Doorlist’s access controls. Offscreen attendee animations pause; route changes slide two clipped viewport layers using transforms, without full-page screenshot layers; background video and avatar animation pause during movement, and background updates retain existing media nodes. Timestamp normalization supports milliseconds, seconds, numeric strings and Firestore timestamps. All upstream access checks remain in force. Refresh runs on reopening, reconnecting, returning to the foreground, and each minute while visible.

Visited screens retain their DOM, media, scroll position and guest filters in a bounded ten-screen memory cache. Rightward drags reveal the cached parent screen, support cancellation, and finish through the same back transition as the Back button. Horizontal carousels and form controls keep their own gestures. Cached screens clear when the signed-in account changes. Home/event lists collapse matching cross-posts only when normalized title, exact start time and street address (or matching artwork when the address is absent) identify the same occurrence; original event IDs stay available for deep links and account access. RSVP counts are never added together across cross-posts.

Profile history retains accessible past events, checking only the signed-in user’s own guest record for confirmed RSVP or admission. When Doorlist’s account feed omits historical records, the count shows a plus sign to indicate the imported events are a minimum; it does not invent a complete native total. Invited by is shown only from the actual guest record’s addedBy identity. Host member lookup is read-only and never sends or fabricates invitations.
