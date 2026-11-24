# V1 Player

A clean, simple video player for Android, built with Kotlin, Jetpack Compose and
[Media3 ExoPlayer](https://developer.android.com/media/media3/exoplayer).

## Features

**Library**
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
├── data/                        MediaStore queries, thumbnails, resume positions, playlist hand-off
├── ui/library/                  library UI and view model
├── ui/player/                   PlayerActivity, Compose controls, gestures, track picker
├── ui/theme/                    Material 3 theme (uses dynamic color on Android 12+)
└── util/                        time and size formatting
```
