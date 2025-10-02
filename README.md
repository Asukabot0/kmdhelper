# KMD Helper

KMD Helper is a Chrome extension that detects course time blocks on Keio University KMD course pages (`archiver.kmd.keio.ac.jp`) and helps you add them to Google Calendar in two ways:

- Open Google Calendar event creation pages directly (multiple windows)
- Create or delete events in bulk via the Google Calendar API (with authorization)

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the `kmdhelpler` directory in this repository.

Note: The extension only runs automatically on the `archiver.kmd.keio.ac.jp` domain.

## Usage

On any course detail page, the extension will:
- Detect time blocks in the format `YYYY-MM-DD (Weekday) HH:MM - HH:MM`
- Convert them into Google Calendar events with title, time, description, and location
- Inject buttons at the bottom of the page:
  - Add all to Calendar: open one Google Calendar creation page per time block (you save them manually)
  - Add all via Google Calendar API: create all events at once via API (requires Google authorization)
  - Delete all via Google Calendar API: delete events previously created via API for the same course (fingerprint-based matching)

### Google Authorization (API buttons only)
- On the first API action, a consent flow will open. The token is cached locally and will be refreshed by re-authorizing when expired.
- Events are created in your `primary` calendar.

## Field Details
- Title: built from course name + session title
- Time: parsed start/end in your local timezone
- Location: extracted from the page field "開講場所 / Class Room" when available; empty otherwise
- Description: the text block following the time and title

## FAQ
- Buttons not visible? Ensure the page domain is `archiver.kmd.keio.ac.jp`, then refresh.
- Creation failed (API)? Likely expired authorization or missing permission; re-authorize when prompted and retry.
- Too many popup windows? Your browser may block popups; allow popups for this page or use the API method instead.

## Development
- Main files live in `kmdhelpler/`:
  - `manifest.json`: extension manifest
  - `content.js`: parses the page and injects buttons/links
  - `background.js`: handles Google OAuth and Calendar API calls
  - `styles.css`: button styles

## Privacy & Security
- OAuth access tokens are stored in Chrome local storage and used only for Google Calendar API calls.
- Do not commit any private keys or secrets. `kmdhelpler.pem` is in `.gitignore` and has been removed from history.

## License
This project is licensed under GPL-3.0-or-later. See the `LICENSE` file at the repository root for details.
