# Google OAuth verification: Calendar sync

Goal: remove the "Google hasn't verified this app" warning (and the 100-user
cap) shown when an organizer connects Google Calendar.

Scopes requested (`lib/google-oauth.ts`):

| Scope | Classification | Used for |
|---|---|---|
| `https://www.googleapis.com/auth/calendar.events` | Sensitive | Create, update, delete the events WardSignup writes for filled slots |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Sensitive | List the user's writable calendars so they can pick one |

Confirm in Cloud Console that these two (and nothing else) are listed under
Google Auth Platform → Data Access. Remove any scope the app does not request.

---

## 1. Pre-flight checklist (Cloud Console → Google Auth Platform)

- [ ] **Branding:** app name "WardSignup", support email, logo (120×120 PNG),
      homepage `https://wardsignup.com`, privacy `https://wardsignup.com/privacy`,
      terms `https://wardsignup.com/terms`.
- [ ] **Authorized domain:** `wardsignup.com`, verified in Google Search Console
      by an account that is Owner/Editor on the Cloud project.
- [ ] Homepage explains what the app does and links to the privacy policy
      (reviewers reject homepages that are only a login screen).
- [ ] Privacy policy names Google Calendar data and includes the Limited Use
      statement (already present: `app/privacy/page.tsx` section 4).
- [ ] **Data Access:** exactly the two scopes above, with justifications (section 3).
- [ ] **Audience:** publishing status "In production" (verification can't be
      requested while in Testing).
- [ ] Demo video uploaded to YouTube as **Unlisted** (section 2).
- [ ] Deploy the scope change to production **before** recording, so the
      consent screen in the video matches the submission.

## 2. Demo video script

Single continuous recording, ~3–4 minutes, English, screen + voiceover
(captions fine instead of voice). Use a production URL, not localhost. Use a
test Google account with a test calendar, and zoom the browser to ~125% so
text is legible.

**Before recording:** sign out of the test Google account's previous grant
(myaccount.google.com → Security → Third-party connections → remove
WardSignup) so the full consent screen appears. Have one spots-type event with
a future slot in an org that has the feature enabled.

| # | On screen | Say |
|---|---|---|
| 1 | `https://wardsignup.com` homepage | "This is WardSignup, a signup sheet tool for congregations and volunteer groups. Organizers can optionally sync filled signup slots to a Google Calendar." |
| 2 | Scroll footer, click Privacy, scroll to "4. Google Calendar" | "Our privacy policy describes the Google Calendar data we access and our compliance with Google's Limited Use requirements." |
| 3 | Sign in as organizer → Settings → Organization → Integrations card | "Calendar sync is opt-in. The organizer starts here." |
| 4 | Click **Connect Google Calendar**. **Pause on the Google account chooser and click the address bar so the full URL with `client_id=…` is visible.** | "This is our OAuth request. The client ID shown matches the project under review." |
| 5 | Consent screen: show app name and both permissions; expand each permission line | "WardSignup requests two permissions: view your list of calendars, and view and edit events on your calendars." |
| 6 | Click Continue/Allow → back in Settings showing connected Google email | "The account is connected." |
| 7 | Open the event → Manage (or Edit) → Google Calendar controls → open the calendar dropdown | "**calendarlist.readonly**: we read the user's calendar list only to populate this picker, showing calendars they can write to. We don't read events or other calendar contents." |
| 8 | Pick the test calendar, turn sync on, save | "The organizer chooses which calendar receives signups." |
| 9 | In a private window, open the public event link and sign up for a slot | "A participant signs up for a time slot." |
| 10 | Back as organizer, wait a few seconds (sync runs automatically after each signup), then open Google Calendar in another tab at that date; open the event | "**calendar.events**: WardSignup created this event for the filled slot. Names are in the description, not the title." |
| 11 | Cancel the signup (admin page delete or cancel link) → wait a few seconds → refresh Google Calendar | "When the slot empties, we delete the event we created. We only ever modify events WardSignup created." |
| 12 | Settings → Integrations → **Disconnect** | "Organizers can disconnect at any time, which revokes our access token at Google." |

Upload to YouTube as Unlisted; paste the link in the verification form.

## 3. Scope justifications (paste into Data Access)

**`calendar.events`**

> WardSignup lets organizers of signup sheets (for example, appointment slots
> for a congregation leader) opt in to syncing filled time slots to a Google
> Calendar they choose. When a participant signs up, changes, or cancels, our
> server creates, updates, or deletes a single event for that time slot on the
> organizer's selected calendar, so the leader sees their appointments without
> manual entry. We only modify events that WardSignup created (tagged with a
> private extended property) and never read or change other events. Narrower
> scopes are not sufficient: `calendar.events.owned` would not support
> writing to shared calendars the organizer has writer access to, and
> `calendar.app.created` only allows writing to a secondary calendar created by
> the app, whereas organizers need to sync to an existing calendar (often a
> shared one) that the leader already uses.

**`calendar.calendarlist.readonly`**

> Used solely to list the calendars the user has writer access to
> (`calendarList.list?minAccessRole=writer`) so the organizer can choose which
> calendar receives synced events. We store only the selected calendar's ID and
> display name. We do not read events or any other calendar data with this
> scope.

**How data is used (if asked):**

> Refresh tokens are encrypted at rest (AES-256-GCM) and used only server-side
> to sync the organizer's chosen calendar. Google user data is not used for
> advertising, not sold, not transferred to third parties, and not used to
> train AI models. Users can disconnect at any time from Settings, which
> revokes the token with Google.

> Note: check the `calendar.events.owned` and `calendar.app.created` claims
> against Google's current scope docs before pasting. If either one would
> work for how organizers use the feature, Google will push you toward it.
