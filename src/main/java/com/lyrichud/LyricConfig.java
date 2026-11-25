package com.lyrichud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Settings saved in .minecraft/config/lyrichud.json */
public final class LyricConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    /** Show the lyrics at all (K key toggles this). */
    public boolean enabled = true;
    /** Shift lyrics in time. Positive = lyrics appear later, negative = earlier. */
    public int offsetMs = 0;
    /** Overall size of the lyrics. */
    public float scale = 1.6f;
    /** 3D turn: how far the left side leans away from you (degrees). */
    public float yawDeg = 26f;
    /** 3D tilt forward/back (degrees). */
    public float pitchDeg = 8f;
    /** Tilt of the text line itself (degrees, negative = rising to the right). */
    public float rollDeg = -3f;
    /** Gap from the right edge of the screen. */
    public int marginRight = 14;
    /** Gap from the top edge of the screen. */
    public int marginTop = 18;
    /** Longest lyric row before it wraps (in Minecraft font pixels, before scaling). */
    public int maxLineWidth = 170;
    /** Colour of the lyrics. */
    public String textColor = "#FFFFFF";
    /** Colour of the word being sung right now. */
    public String highlightColor = "#C792FF";
    /** Show the faded upcoming line under the current one. */
    public boolean showNextLine = true;
    /** Show the small "song · artist  time" row above the lyrics. */
    public boolean showSongInfo = true;

    public static Path path() {
        return FabricLoader.getInstance().getConfigDir().resolve("lyrichud.json");
    }

    public static LyricConfig load() {
        Path p = path();
        if (Files.exists(p)) {
            try (Reader r = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
                LyricConfig c = GSON.fromJson(r, LyricConfig.class);
                if (c != null) {
                    c.save(); // writes any newly added options back to the file
                    return c;
                }
            } catch (Exception e) {
                LyricHudClient.LOG.warn("Could not read {}, using defaults", p, e);
            }
        }
        LyricConfig c = new LyricConfig();
        c.save();
        return c;
    }

    public void save() {
        try {
            Files.createDirectories(path().getParent());
            try (Writer w = Files.newBufferedWriter(path(), StandardCharsets.UTF_8)) {
                GSON.toJson(this, w);
            }
        } catch (Exception e) {
            LyricHudClient.LOG.warn("Could not save Lyric HUD config", e);
        }
    }

    public static int parseColor(String hex, int fallback) {
        try {
            String h = hex.trim();
            if (h.startsWith("#")) h = h.substring(1);
            int rgb = (int) Long.parseLong(h, 16);
            return h.length() <= 6 ? (0xFF000000 | rgb) : rgb;
        } catch (Exception e) {
            return fallback;
        }
    }
}
