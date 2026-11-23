package dev.lumen.ai;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.lumen.Lumen;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Server-side configuration, stored at {@code config/lumen.json}.
 * <p>
 * The AI backend is any OpenAI-compatible chat-completions endpoint (Groq, OpenAI, OpenRouter,
 * a local Ollama / LM Studio server, ...). With no API key configured, Lumen falls back to its
 * built-in offline dialogue so the mod is fully playable without any account.
 */
public final class LumenConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
	private static LumenConfig instance = new LumenConfig();

	/** Master switch for the online AI. When false (or no key), offline dialogue is used. */
	public boolean enableAi = true;
	/** API key. Can also be supplied through the LUMEN_API_KEY environment variable. */
	public String apiKey = "";
	/** OpenAI-compatible chat completions URL. Defaults to Groq's free tier. */
	public String apiUrl = "https://api.groq.com/openai/v1/chat/completions";
	public String model = "llama-3.3-70b-versatile";
	public double temperature = 0.9;
	public int maxTokens = 160;
	public int requestTimeoutSeconds = 20;
	/** Number of past chat lines (both sides) Lumen remembers per conversation. */
	public int memoryLines = 16;
	/** Extra text appended to the persona prompt, for server owners who want to flavour Lumen. */
	public String extraPersona = "";

	/** Messages starting with this word (case-insensitive) are addressed to your Lumen. */
	public String chatTrigger = "lumen";
	/** If true, messages addressed to Lumen are hidden from public chat (only you see the exchange). */
	public boolean privateConversations = true;
	/** Average seconds between unprompted remarks. 0 disables them. */
	public int ambientRemarkSeconds = 300;

	/** Trust at or below which Lumen turns hostile. Trust ranges from -100 to 100. */
	public int hostilityThreshold = -50;
	/** Whether a hostile Lumen may call a Hollow on its owner. */
	public boolean allowHollowSummons = true;
	/** Minimum seconds between Hollow summons per Lumen. */
	public int summonCooldownSeconds = 240;
	/** Seconds a summoned Hollow lingers before fading away. */
	public int hollowLifetimeSeconds = 180;

	/** Give every player a Lumen Vessel the first time they join. */
	public boolean giveVesselOnFirstJoin = true;

	public static LumenConfig get() {
		return instance;
	}

	public String effectiveApiKey() {
		if (apiKey != null && !apiKey.isBlank()) return apiKey.trim();
		String env = System.getenv("LUMEN_API_KEY");
		return env == null ? "" : env.trim();
	}

	public boolean aiAvailable() {
		return enableAi && !effectiveApiKey().isEmpty() && apiUrl != null && !apiUrl.isBlank();
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve("lumen.json");
	}

	public static void load() {
		Path path = path();
		try {
			if (Files.exists(path)) {
				LumenConfig loaded = GSON.fromJson(Files.readString(path, StandardCharsets.UTF_8), LumenConfig.class);
				if (loaded != null) instance = loaded;
			}
			save();
		} catch (Exception e) {
			Lumen.LOGGER.error("Failed to load {}; using defaults", path, e);
			instance = new LumenConfig();
		}
	}

	public static void save() {
		try {
			Files.createDirectories(path().getParent());
			Files.writeString(path(), GSON.toJson(instance), StandardCharsets.UTF_8);
		} catch (IOException e) {
			Lumen.LOGGER.error("Failed to save {}", path(), e);
		}
	}
}
