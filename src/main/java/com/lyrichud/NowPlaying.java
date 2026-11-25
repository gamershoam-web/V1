package com.lyrichud;

/** What is playing right now. {@code positionMs} is valid at {@code sampledAt} (System.currentTimeMillis). */
public record NowPlaying(String app, String title, String artist, String album,
                         boolean playing, long positionMs, long durationMs, long sampledAt) {
    public long positionNow() {
        long p = positionMs + (playing ? System.currentTimeMillis() - sampledAt : 0);
        if (durationMs > 0) p = Math.min(p, durationMs);
        return Math.max(0, p);
    }

    public String key() { return title + "\u0000" + artist; }
}
