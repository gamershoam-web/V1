package com.aidraw.ai;

import com.aidraw.AiDrawMod;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;

/** config/aidraw.json — created on first launch. */
public final class AiConfig {
    public String apiKey = "";
    public String model = "claude-opus-5-5";
    public String effort = "low";
    public int cooldownSeconds = 15;
    public int maxVanillaItemCount = 16;
    public boolean allowBossMobs = false;
    public boolean allowVanillaItems = true;

    private static AiConfig INSTANCE = new AiConfig();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static AiConfig get() { return INSTANCE; }

    public String key() {
        if (apiKey != null && !apiKey.isBlank()) return apiKey.trim();
        String env = System.getenv("ANTHROPIC_API_KEY");
        return env == null ? "" : env.trim();
    }

    public boolean hasKey() { return !key().isEmpty(); }

    public static void load() {
        Path path = FabricLoader.getInstance().getConfigDir().resolve("aidraw.json");
        try {
            if (Files.exists(path)) {
                AiConfig loaded = GSON.fromJson(Files.readString(path), AiConfig.class);
                if (loaded != null) INSTANCE = loaded;
            }
            Files.writeString(path, GSON.toJson(INSTANCE)); // writes defaults / adds new fields
        } catch (Exception e) {
            AiDrawMod.LOGGER.error("Could not read {} — using defaults", path, e);
        }
    }

    private AiConfig() {}
}
