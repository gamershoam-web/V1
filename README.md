# Lumen

An AI companion mod for **Minecraft Java 1.21.11** (Fabric).

Lumen is a small floating eye of light. Open its vessel and it binds itself to you. It hovers over your shoulder, talks back using an LLM, and remembers how you treat it. If you treat it well, it gives you gifts. If you hurt it, it turns red and calls something out of the dark.

| Awakening | Your Lumen | Betrayed | The Hollow |
|---|---|---|---|
| ![](docs/vessel.png) | ![](docs/lumen.png) | ![](docs/hostile.png) | ![](docs/hollow.png) |

*(Screenshots are taken automatically by the end-to-end test suite.)*

## Features

- **Lumen Vessel.** Every player gets one the first time they join. Place it and right-click it: a spiral of light tightens around it for five seconds, the glass shatters, and your Lumen wakes up.
  Recipe: amethyst shards in the corners, glass on the sides, an Eye of Ender in the middle.
- **Lumen, the companion.** It hovers over your right shoulder, always faces you, and blinks. It passes through walls and can't be hurt by mobs. It follows you across teleports and dimensions: if it falls behind, it dissolves and re-forms next to you.
- **Talk to it.** Start a chat message with `lumen` (or its name), e.g. `lumen, where do I find diamonds?`, or use `/lumen say ...`. These conversations are private by default.
  - **Online:** set an API key for any OpenAI-compatible endpoint (Groq's free tier is the default). Lumen then has a persona, remembers the conversation, and knows what's around you: biome, dimension, time, weather, health, hunger, held item, and nearby hostile mobs.
  - **Offline:** with no key, Lumen uses built-in dialogue that still understands requests to stay or follow, apologies, insults, thanks, and requests for help. The mod is fully playable without an account.
- **Trust (-100 to 100).** The AI can raise or lower trust based on what you say. Gifts raise it: glowstone, amethyst, glow berries, flowers, golden apples, and Hollow Shards. Hitting your Lumen costs 15 trust.
  - **Calm** (trust 0 or above): a cyan eye. It offers advice and unprompted remarks, warns you when your health is low, and at high trust may drop gifts.
  - **Uneasy** (trust below 0): an amber eye with clipped replies. Trust slowly recovers over time.
  - **Hostile** (trust at or below -50): a red slit-pupil eye trailing smoke, sculk shrieks, and menacing lines. It may summon the Hollow.
- **The Hollow.** A gaunt shadow creature: 40 HP, armored, with glowing eyes. It hunts only the player who angered the Lumen, blinks behind you when you run, and its hits cause Darkness. It fades after 3 minutes. It drops **Hollow Shards**, which are the best gift for winning your Lumen back.
- Shift-right-click your Lumen to toggle stay/follow. Right-click it for a status line and a reaction.

## Commands

| Command | |
|---|---|
| `/lumen say <message>` | Talk to your Lumen (same as `lumen, <message>` in chat) |
| `/lumen call` | Bring it to you from anywhere |
| `/lumen stay` / `/lumen follow` | Set its mode |
| `/lumen status` | Show its name, trust, mood, mode, and AI status |
| `/lumen name <name>` | Rename it (chat messages starting with the new name also reach it) |
| `/lumen forget` | Clear its conversation memory |
| `/lumen release` | Unbind it permanently |
| `/lumen reload` | (op) Reload `config/lumen.json` |
| `/lumen trust <-100..100>` | (op) Set your trust, for testing |

## Install

1. Install [Fabric Loader](https://fabricmc.net/use/) 0.17+ for Minecraft 1.21.11.
2. Put [Fabric API](https://modrinth.com/mod/fabric-api) (0.141.6+1.21.11 or newer) and `lumen-1.0.0.jar` in your `mods/` folder.
3. On a server, install the mod on the server. Clients also need it to see the entities and blocks.

## Enabling the AI

After the first launch, edit `config/lumen.json` (or set the `LUMEN_API_KEY` environment variable), then run `/lumen reload`:

```json
{
  "enableAi": true,
  "apiKey": "gsk_...",
  "apiUrl": "https://api.groq.com/openai/v1/chat/completions",
  "model": "llama-3.3-70b-versatile"
}
```

Any OpenAI-compatible chat-completions endpoint works:

| Provider | `apiUrl` | example `model` |
|---|---|---|
| Groq (free tier) | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | any |
| Ollama (local) | `http://localhost:11434/v1/chat/completions` | `llama3.1` (any key) |

Requests are sent from the **server** off the main thread, so the game never stalls. If a request fails, Lumen falls back to its offline dialogue.

Other options in `config/lumen.json`: `chatTrigger`, `privateConversations`, `ambientRemarkSeconds`, `hostilityThreshold`, `allowHollowSummons`, `summonCooldownSeconds`, `hollowLifetimeSeconds`, `giveVesselOnFirstJoin`, `memoryLines`, `temperature`, `maxTokens`, `extraPersona`.

## Building

Requires JDK 21.

```sh
./gradlew build                 # -> build/libs/lumen-1.0.0.jar
./gradlew runClient             # dev client
./gradlew runServer             # dev server
xvfb-run -a ./gradlew runClientGameTest   # end-to-end test (drop xvfb-run if you have a display)
```

The client game test boots a real client, creates a world, and plays through every feature with assertions:

- the vessel awakening and the first-join gift
- following, plus stay/follow through chat and through `/lumen say`
- catching up after long teleports and re-manifesting across dimensions, with no duplicate Lumens left behind
- gifts and owner damage changing trust
- the hostile mood and the Hollow summon
- the full AI request/response pipeline against a local mock endpoint
- `/lumen release`

Textures are generated by `tools/gen_textures.py` (requires Pillow).
