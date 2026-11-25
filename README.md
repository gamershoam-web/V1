# Lyric HUD (Fabric 1.21.11)

Shows **live, synced lyrics** for whatever you are playing in **Spotify, YouTube Music or YouTube**,
in 3D in the **top-right corner** of your Minecraft screen. The word being sung lights up purple.

- The music keeps playing in your normal app (Spotify app, or YouTube / YouTube Music in any browser).
- The mod reads what is playing from Windows and finds the timed lyrics automatically on
  [LRCLIB](https://lrclib.net), a free lyrics database. You don't need an account or any setup.
- The lyrics stay pinned in the corner. They tilt in 3D but never float around.
- Client-side only, so it works on any server.

## Requirements
- **Windows 10 or 11**, because reading the song from Spotify/YouTube uses Windows media controls
- Minecraft **Java Edition 1.21.11**
- [Fabric Loader](https://fabricmc.net/use/) 0.17+ and [Fabric API](https://modrinth.com/mod/fabric-api) for 1.21.11

## Install
1. Install Fabric Loader for 1.21.11.
2. Put `fabric-api-...+1.21.11.jar` and `lyrichud-1.0.0.jar` in `%appdata%\.minecraft\mods`.
3. Start Minecraft with the Fabric profile.
4. Play a song in Spotify, YouTube Music or YouTube, then join a world. The lyrics appear top-right.

Want to see the look without any music? Type `/lyrichud demo` in chat.

## Keys (change them in Options → Controls → Lyric HUD)
| Key | Action |
|-----|--------|
| `K` | Show / hide lyrics |
| `\` | Play / pause the music |
| `]` | Next song |
| `[` | Previous song |

## Commands
| Command | What it does |
|---------|--------------|
| `/lyrichud` | Shows what's playing and whether lyrics were found |
| `/lyrichud toggle` | Show / hide lyrics |
| `/lyrichud offset <ms>` | Fix timing. `500` = lyrics later, `-500` = lyrics earlier |
| `/lyrichud demo` | Plays a built-in demo song to preview the look |
| `/lyrichud reload` | Reloads the config and retries songs that had no lyrics |

## Settings
Edit `.minecraft/config/lyrichud.json`, then run `/lyrichud reload`:

| Setting | Default | Meaning |
|---------|---------|---------|
| `scale` | `1.3` | Text size |
| `yawDeg` | `26` | How much the panel turns in 3D (0 = flat) |
| `pitchDeg` | `8` | Tilt forward/back |
| `rollDeg` | `-3` | Slant of the text line |
| `marginRight`, `marginTop` | `14`, `18` | Distance from the corner |
| `maxLineWidth` | `170` | When long lines wrap |
| `textColor` | `#FFFFFF` | Lyric colour |
| `highlightColor` | `#C792FF` | Colour of the word being sung |
| `showNextLine` | `true` | Faded preview of the next line |
| `showSongInfo` | `true` | Small "♪ song · artist 0:12 / 2:45" row |
| `offsetMs` | `0` | Timing fix (same as `/lyrichud offset`) |

## Notes
- Some songs (rare or brand new ones) have no synced lyrics on LRCLIB. Then you'll see "no synced lyrics found".
  Anyone can add lyrics to LRCLIB.
- YouTube video titles like `Artist - Song (Official Video)` are cleaned up automatically before searching.
- If the lyrics are a bit early or late, use `/lyrichud offset`.
- If several apps play at once, the mod follows the one that's playing.

## Build from source
```
./gradlew build        # jar ends up in build/libs/
```
Needs JDK 21.
