package com.aidraw.ai;

import com.aidraw.AiDrawMod;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;

/** config/aidraw.json — created on first launch. */
public final class AiConfig {
    /** Free Gemini key (AIza...) from aistudio.google.com, or an Anthropic key (sk-ant-...). */
    public String apiKey = "";
    public String model = "claude-opus-5-5";
    /** "" = automatic (fastest free model that's available). Set a model name to force it first. */
    public String geminiModel = "";
    public String effort = "medium";
    public int cooldownSeconds = 15;
    public int maxVanillaItemCount = 16;
    public boolean allowBossMobs = false;
    public boolean allowVanillaItems = true;
    /** Nukes from atom-bomb drawings. Radius at max strength (blocks). */
    public boolean allowNukes = true;
    public int maxNukeRadius = 40;
    /** false = explosions/nukes hurt mobs but never break blocks. */
    public boolean blockDamage = true;
    /** Highest melee damage a drawn weapon may have. */
    public int maxAttackDamage = 30;

    private static AiConfig INSTANCE = new AiConfig();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static AiConfig get() { return INSTANCE; }

    public String key() {
        if (apiKey != null && !apiKey.isBlank()) return apiKey.trim();
        for (String var : new String[]{"GEMINI_API_KEY", "ANTHROPIC_API_KEY"}) {
            String env = System.getenv(var);
            if (env != null && !env.isBlank()) return env.trim();
        }
        return "";
    }

    public boolean hasKey() { return !key().isEmpty(); }

    private static Path path() { return FabricLoader.getInstance().getConfigDir().resolve("aidraw.json"); }

    /** Saves the current settings (used by /aidraw key). */
    public static boolean save() {
        try {
            Files.writeString(path(), GSON.toJson(INSTANCE));
            return true;
        } catch (Exception e) {
            AiDrawMod.LOGGER.error("Could not save {}", path(), e);
            return false;
        }
    }

    public static void load() {
        Path path = path();
        try {
            if (Files.exists(path)) {
                AiConfig loaded = GSON.fromJson(Files.readString(path), AiConfig.class);
                if (loaded != null) INSTANCE = loaded;
                // Migrate the old default, which is often overloaded on the free tier, to automatic.
                if ("gemini-flash-latest".equals(INSTANCE.geminiModel)) INSTANCE.geminiModel = "";
            }
            Files.writeString(path, GSON.toJson(INSTANCE)); // writes defaults / adds new fields
        } catch (Exception e) {
            AiDrawMod.LOGGER.error("Could not read {} — using defaults", path, e);
        }
    }

    private AiConfig() {}
}
