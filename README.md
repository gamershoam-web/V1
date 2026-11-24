# Lumen

A clean, simple video player for Android, built with Kotlin, Jetpack Compose and
[Media3 ExoPlayer](https://developer.android.com/media/media3/exoplayer), plus an optional
self-hosted server and website (in [`server/`](server/README.md)) so you can upload your videos
to your own VPS and watch them anywhere.

## Look and feel

A "liquid glass" design: frosted panels with light-catching edges float over slowly drifting colour
glows. The top bar and the floating tab switcher blur whatever scrolls beneath them (Android 12+;
older versions get a tinted glass). Motion is kept subtle: cards press in when tapped, the tab pill
slides, tabs cross-fade, and player controls glide in. The website uses the same style.

Screens can be rendered to PNG without a device: `./gradlew testDebugUnitTest --tests '*ScreenshotTest*'`
(output in `app/build/screenshots`).

## Pick up where you left off

Every video remembers where you stopped, on the phone and on your server:

- **Continue watching** rows at the top of the app (phone and server tabs) and the website
- Opening a half-watched video jumps back to that spot and shows **Resumed from 12:34 · Start over**
- Progress for server videos is shared: stop on the phone, continue in the browser, or the other way round
- Finished videos drop out of Continue watching automatically; ⋮ → **Start from beginning** resets one

## Series

Group server videos into a **series** with **seasons**:

- Create a series from the Server tab (app) or the library (website), or from any video's ⋮ → **Add to series…**
- Add, rename and delete seasons; add episodes from your library, reorder them, or remove them
  (removing never deletes the video)
- **Next up** is worked out from what you've watched, on any device: press **Resume S1 E3** and
  the following episodes play on their own, across seasons

## Your own server

Run the server on a VPS with one line in a root shell (full guide in [server/README.md](server/README.md)):

```bash
curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-bf2e92af-l5c6am/server/get.sh | bash
```

Then:

- **Website**: sign in, drag videos in to upload, watch them in the browser
- **App**: **Server** tab → **Connect server** → stream your server's videos
- **Upload from the phone**: ⋮ on any video in **This phone** → **Upload to server**
  (runs in the background with a notification, and resumes if the connection drops)

## Features

**Library**
- Two tabs: **This phone** and **Server**
- Finds every video on the device, with thumbnails, length, resolution and size
- Grid or list view, sort by date, name, length or size
- Filter by folder (Camera, Downloads, WhatsApp, …) and search by name
- A progress bar on each thumbnail shows how far you got; videos resume where you left off
- Open any file with the system picker, or play a link (MP4, WebM, MKV, HLS `.m3u8`)
- Shows up in "Open with…" for videos from other apps

**Player**
- Tap to show or hide controls; they hide again on their own while playing
- Double-tap the left or right side to skip 10 s (keep tapping to skip further)
- Swipe left/right to scrub, swipe up/down on the left for brightness and on the right for volume
- Playback speed from 0.25× to 2×
- Audio track and subtitle selection, including loading `.srt`, `.vtt`, `.ass` and `.ttml` files
- Fit, crop or stretch the picture
- Rotates to match the video, with a manual rotate button
- Lock the screen against accidental touches
- Picture-in-picture (also starts automatically when you leave the app while a video plays)
- Next and previous through the folder you opened the video from
- Pauses when headphones are unplugged and works with media buttons

## Requirements

- Android 8.0 (API 26) or newer
- To build: JDK 17+ and the Android SDK (platform 35), or Android Studio

## Build

```bash
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease      # app/build/outputs/apk/release/app-release.apk (shrunk, ~2 MB)
```

Install on a connected phone with `adb install app/build/outputs/apk/release/app-release.apk`,
or open the project in Android Studio and press Run.

Every push also builds both APKs on GitHub Actions. You can download them from the
**Build APK** workflow run's artifacts.

The release build is signed with the debug key so it installs straight away. Set up your own
signing config in `app/build.gradle.kts` before publishing to Google Play.

## Project layout

```
app/src/main/java/com/v1/player/
├── MainActivity.kt              library screen host + permissions
├── V1App.kt                     image loader setup (thumbnails)
├── data/                        MediaStore queries, thumbnails, resume positions, playlist hand-off,
│                                server API client and background upload worker
├── ui/library/                  library UI and view model
├── ui/player/                   PlayerActivity, Compose controls, gestures, track picker
├── ui/theme/                    Material 3 theme (uses dynamic color on Android 12+)
└── util/                        time and size formatting

server/
├── server.js                    the whole server: API, uploads, streaming, progress (no npm packages)
├── public/                      the website (plain HTML, CSS and JavaScript)
├── Dockerfile, docker-compose.yml, Caddyfile
└── install.sh                   one-command VPS setup with automatic HTTPS
```
