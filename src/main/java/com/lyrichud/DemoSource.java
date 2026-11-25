package com.lyrichud;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** A fake song with built-in lyrics, so you can preview the look without any music app. */
public final class DemoSource {
    public static final long LENGTH_MS = 40_000;
    private final Lyrics lyrics;
    private long startedAt;
    private boolean active;

    public DemoSource() {
        String text = "";
        try (InputStream in = DemoSource.class.getResourceAsStream("/lyrichud/demo.lrc")) {
            if (in != null) text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {}
        lyrics = Lyrics.parse(text);
    }

    public boolean active() { return active; }

    public void setActive(boolean on) {
        active = on;
        startedAt = System.currentTimeMillis();
    }

    public Lyrics lyrics() { return lyrics; }

    public NowPlaying current() {
        long now = System.currentTimeMillis();
        long pos = (now - startedAt) % LENGTH_MS;
        return new NowPlaying("demo", "Lyric HUD Demo", "Test Track", "", true, pos, LENGTH_MS, now);
    }
}
