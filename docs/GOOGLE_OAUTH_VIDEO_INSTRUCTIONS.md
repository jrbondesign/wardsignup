# Task: Record the Google OAuth verification demo video for WardSignup

You are producing a screen-recorded demo video that Google's OAuth review team
will watch to verify WardSignup's use of two Google Calendar scopes. The video
has **no voice-over**. Instead, add **on-screen text captions** after recording.

Follow every step in order. Do not skip or reorder steps. Do not add steps that
show other parts of the app.

---

## Facts you need

- App name: **WardSignup**
- Production site: **https://wardsignup.com** (never use localhost or a preview URL)
- Privacy policy: https://wardsignup.com/privacy (section "4. Google Calendar")
- Scopes being verified:
  1. `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
  2. `https://www.googleapis.com/auth/calendar.events`
- Feature is only enabled for the **Smoke Test** organization.

## Human-only steps

A human (the account owner) must do these. Stop and ask them, do not attempt them yourself:
- Signing in to the WardSignup organizer account.
- Signing in to the test Google account and clicking Allow on Google's consent screen.
- Uploading to YouTube and submitting the verification form in Google Cloud Console.

---

## Part A: Setup (do not record)

1. In the test Google account, go to https://myaccount.google.com/connections
   and remove **WardSignup** if listed. This makes the full consent screen appear.
2. In Google Calendar for that account, make sure a calendar named
   **"WardSignup Test"** exists (create it if not).
3. In WardSignup, signed in as organizer in the **Smoke Test** org, make sure
   there is a **spots**-type event with at least one open slot dated in the
   future. Copy its public signup link.
4. If that org is already connected to Google Calendar, go to
   Settings → Organization and click **Disconnect** first.
5. Browser setup:
   - Window about 1440×900, browser zoom **125%**.
   - Close unrelated tabs. Hide bookmarks bar, extensions and notifications.
   - Open a separate **private/incognito window** for the participant signup (step 9).
6. Recorder: full-screen recording at 1080p or higher, no microphone.

## Part B: Recording (one continuous take, about 3–4 minutes)

Move slowly. **Hold each screen for at least 3 seconds** so a caption can sit on it.
Steps marked ⚠️ are what reviewers check most closely; hold those for 5+ seconds.

| # | Action | Hold |
|---|---|---|
| 1 | Open `https://wardsignup.com`. | 4s |
| 2 | Scroll to footer → click **Privacy** → scroll to section **"4. Google Calendar"** so its text is readable. | 6s |
| 3 | Go to **Settings → Organization** (already signed in as organizer). Scroll to the Google Calendar card. | 4s |
| 4 ⚠️ | Click **Connect Google Calendar**. When Google's page loads, **click into the address bar** and scroll slowly through the URL so `client_id=` and its value are visible. | 6s |
| 5 ⚠️ | Choose the test account. On the consent screen, show the **app name "WardSignup"** and **both permission lines**. Expand each permission's details if there's an arrow. | 6s |
| 6 | Click **Continue/Allow**. Show Settings with the Google account listed as connected. | 4s |
| 7 ⚠️ | Open the test event → **Manage** → Google Calendar controls → **open the calendar dropdown** so the list is visible. | 5s |
| 8 | Select **WardSignup Test**, turn sync **On**, save. Show the enabled state. | 4s |
| 9 | Switch to the private window. Open the public event link. Sign up for a slot as name **"Test Participant"**, phone **555-0100**, note **"Demo signup"**. Show the confirmation. | 5s |
| 10 ⚠️ | Wait ~5 seconds. Open **calendar.google.com** in a new tab, go to that slot's date, click the event so the details panel shows the title and description. | 6s |
| 11 | Back in WardSignup → event admin page → **delete** that signup. Wait ~5 seconds. Return to Google Calendar, refresh, show the event is gone. | 5s |
| 12 | Go to **Settings → Organization** → click **Disconnect**. Show the disconnected state. | 4s |

Stop recording.

**If at step 10 the event does not appear after 30 seconds, stop and report it.
Do not wait for it or edit around it.**

## Part C: Add captions (iMovie, CapCut, Loom or similar)

Put one caption on screen during each step, using the exact text below.
Style: white text on a semi-transparent dark bar, bottom of frame, large enough
to read at 720p. Keep each caption up for the full step.

| # | Caption |
|---|---|
| 1 | WardSignup: signup sheets for congregations and volunteer groups. Organizers can optionally sync filled signup slots to their Google Calendar. |
| 2 | Our privacy policy discloses the Google Calendar data we access and our compliance with the Google API Services User Data Policy, including Limited Use. |
| 3 | Google Calendar sync is opt-in. An organizer connects it from Organization Settings. |
| 4 | OAuth request for WardSignup. The client_id in this URL matches the Google Cloud project under review. |
| 5 | WardSignup requests two scopes: calendar.calendarlist.readonly and calendar.events. |
| 6 | The organizer's Google account is now connected. |
| 7 | Scope: calendar.calendarlist.readonly. Used only to list calendars the organizer can write to, to fill this picker. We do not read events or other calendar data. |
| 8 | The organizer chooses which calendar receives synced signups. |
| 9 | A participant signs up for a time slot on the public signup page. |
| 10 | Scope: calendar.events. WardSignup created this event for the filled slot. The title shows the event name and first name; contact details and notes are only in the description. |
| 11 | When a slot empties, WardSignup deletes the event it created. It only modifies events it created. |
| 12 | Organizers can disconnect at any time. Disconnecting revokes WardSignup's access at Google. |

Optional: a 3-second title card at the start: "WardSignup — Google Calendar
integration demo (OAuth verification)".

## Part D: Export and hand off

1. Export as MP4, 1080p.
2. Check the export: every caption readable, the step 4 URL with `client_id`
   legible, and both permission lines on the consent screen legible.
3. Give the file to the human. They upload it to YouTube as **Unlisted** (not
   Private) and paste the link into Google Cloud Console → Google Auth
   Platform → Verification Center.

## Do not

- Show localhost, preview URLs, the Vercel dashboard, code, or env vars.
- Show real member names, phone numbers or emails. Use only the test data above.
- Cut out the consent screen or the address bar at step 4.
- Speed the video up.
