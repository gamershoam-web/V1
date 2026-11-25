# V1 Voice Changer (Android)

A real-time voice changer for Android that changes your voice **inside Discord calls**
and other call apps (WhatsApp, Telegram, Messenger, Signal and more).

## How it works

Android doesn't let one app change another app's microphone. That's why voice changers
from the Play Store can't change your voice in a Discord call. This app handles it two ways:

| Mode | Needs | What you get |
|---|---|---|
| **In-call mode** | Root + [LSPosed](https://github.com/LSPosed/LSPosed) | Your voice changes live in Discord or WhatsApp calls. Friends hear the effect, and you can switch voices mid-call. |
| **Standalone** | Nothing | Hear yourself with the effect through headphones, record clips, share them to Discord. |

In-call mode is an LSPosed module. Inside each app you pick, it hooks every
`android.media.AudioRecord.read(...)` overload and runs the voice effect on the microphone
samples before the app encodes and sends them. Settings are shared with the hooked apps
through LSPosed's `XSharedPreferences`, so voice changes apply within about half a second,
even during a call.

## Install and set up (in-call mode)

1. Root your phone (Magisk, KernelSU or APatch) and install **LSPosed (Zygisk)**.
2. Install the APK (download it from the **Actions** tab, or build it yourself, see below).
3. LSPosed → Modules → enable **V1 Voice Changer** and tick **Discord** (and any other apps) in its scope.
4. Force-stop Discord or reboot.
5. Open V1 Voice Changer, turn on **Change my voice in calls** and pick a voice.
6. Join a Discord call.

The status line at the top of the app shows whether LSPosed has loaded the module.

### Limitations
- Normal SIM/carrier phone calls go through the modem, not through apps, so this can't change them.
- An app that records through native AAudio/OpenSL instead of Java `AudioRecord` is not
  affected. Discord, WhatsApp and Telegram use `AudioRecord` (WebRTC's Java audio device) on most builds.

## Voices

Normal, Girl, Man, Monster, Chipmunk, Baby, Robot, Alien, Villain, Radio, Telephone, Cave, Drunk, Ghost.
You can fine-tune any of them: pitch (±12 semitones), brightness, robot, wobble, echo, distortion and volume.

## Build

```bash
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

You need JDK 17+ and the Android SDK (set `sdk.dir` in `local.properties` or `ANDROID_HOME`).
The release build is signed with the debug key so it installs directly. Use your own key before publishing.

## Project layout

```
app/src/main/java/com/v1/voicechanger/
  dsp/                 effect engine (pure Java, no Android deps)
    PitchShifter       low-latency dual-tap delay-line pitch shifter
    VoiceProcessor     effect chain: gain, filters, pitch, wobble, ring-mod, drive, echo, limiter
    MultiChannelProcessor  runs the chain over short/byte/float/ByteBuffer PCM
    Presets, VoiceParams
  xposed/HookEntry     LSPosed entry point, hooks AudioRecord.read in target apps
  xposed/HookConfig    live-reloads settings inside the hooked app
  MainActivity         UI
  LiveVoiceService     standalone mic -> effect -> headphones / WAV recorder
  ClipProvider         shares recorded clips to other apps
xposed-stubs/          compile-only Xposed API stubs (not packaged; LSPosed provides the real API)
```

## Use responsibly

Don't use a changed voice to impersonate real people, scam anyone or get around a platform's rules.
