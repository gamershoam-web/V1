package com.lyrichud;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Finds time-synced lyrics on LRCLIB (https://lrclib.net), a free, open lyrics database.
 * Lookups run in the background and are cached per song.
 */
public final class LyricsService {
    public enum Status { SEARCHING, FOUND, NOT_FOUND, INSTRUMENTAL, ERROR }

    public record Result(Status status, Lyrics lyrics) {
        static final Result SEARCHING = new Result(Status.SEARCHING, null);
    }

    private static final String API = "https://lrclib.net/api/";
    private static final String USER_AGENT = "LyricHUD/1.0 (Minecraft Fabric mod)";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ExecutorService pool = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "LyricHUD-lyrics");
        t.setDaemon(true);
        return t;
    });
    private final Map<String, Result> cache = new ConcurrentHashMap<>();

    public Result get(String title, String artist, String album, long durationMs) {
        String key = (title + "\u0000" + artist).toLowerCase(Locale.ROOT);
        Result r = cache.get(key);
        if (r != null) return r;
        cache.put(key, Result.SEARCHING);
        pool.submit(() -> {
            Result res;
            try {
                res = lookup(title, artist, album, durationMs);
            } catch (Exception e) {
                LyricHudClient.LOG.warn("Lyric lookup failed for '{}' by '{}': {}", title, artist, e.toString());
                res = new Result(Status.ERROR, null);
            }
            cache.put(key, res);
        });
        return Result.SEARCHING;
    }

    public void clearFailures() {
        cache.values().removeIf(r -> r.status() == Status.ERROR || r.status() == Status.NOT_FOUND);
    }

    // ---------------------------------------------------------------------------------

    private Result lookup(String rawTitle, String rawArtist, String album, long durationMs) throws Exception {
        int durationSec = durationMs > 0 ? (int) Math.round(durationMs / 1000.0) : -1;
        boolean sawInstrumental = false;

        for (String[] c : candidates(rawTitle, rawArtist)) {
            String track = c[0], artist = c[1];
            if (track.isBlank()) continue;

            // 1) exact match
            if (!artist.isBlank()) {
                StringBuilder q = new StringBuilder("get?track_name=").append(enc(track))
                        .append("&artist_name=").append(enc(artist));
                if (durationSec > 0) q.append("&duration=").append(durationSec);
                JsonElement e = request(q.toString());
                if (e != null && e.isJsonObject()) {
                    JsonObject o = e.getAsJsonObject();
                    String synced = str(o, "syncedLyrics");
                    if (synced != null && !synced.isBlank()) return found(synced);
                    if (o.has("instrumental") && o.get("instrumental").getAsBoolean()) sawInstrumental = true;
                }
            }

            // 2) search
            String q = artist.isBlank()
                    ? "search?q=" + enc(track)
                    : "search?track_name=" + enc(track) + "&artist_name=" + enc(artist);
            String best = pickBest(request(q), durationSec);
            if (best != null) return found(best);
        }

        // 3) loose search with everything we know
        String loose = cleanTitle(rawTitle) + " " + cleanArtist(rawArtist);
        String best = pickBest(request("search?q=" + enc(loose.trim())), durationSec);
        if (best != null) return found(best);

        return new Result(sawInstrumental ? Status.INSTRUMENTAL : Status.NOT_FOUND, null);
    }

    private static Result found(String synced) {
        Lyrics l = Lyrics.parse(synced);
        return l.lines.isEmpty() ? new Result(Status.NOT_FOUND, null) : new Result(Status.FOUND, l);
    }

    private static String pickBest(JsonElement e, int durationSec) {
        if (e == null || !e.isJsonArray()) return null;
        JsonArray arr = e.getAsJsonArray();
        String best = null;
        double bestDiff = Double.MAX_VALUE;
        for (JsonElement el : arr) {
            if (!el.isJsonObject()) continue;
            JsonObject o = el.getAsJsonObject();
            String synced = str(o, "syncedLyrics");
            if (synced == null || synced.isBlank()) continue;
            double d = (durationSec > 0 && o.has("duration") && !o.get("duration").isJsonNull())
                    ? Math.abs(o.get("duration").getAsDouble() - durationSec) : 0;
            if (durationSec > 0 && d > 8) continue; // a different version of the song
            if (d < bestDiff) { bestDiff = d; best = synced; }
        }
        return best;
    }

    private JsonElement request(String pathAndQuery) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + pathAndQuery))
                .timeout(Duration.ofSeconds(12))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .GET().build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() == 404) return null;
        if (resp.statusCode() / 100 != 2) throw new IllegalStateException("HTTP " + resp.statusCode());
        return JsonParser.parseString(resp.body());
    }

    private static String str(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : null;
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }

    // ---------------------------------------------------------------------------------
    // Cleaning up titles from YouTube, e.g. "Artist - Song (Official Music Video) [4K]"

    private static final Pattern BRACKETS = Pattern.compile("\\s*[(\\[【{][^)\\]】}]*[)\\]】}]");
    private static final Pattern FEAT = Pattern.compile("(?i)\\s+(feat\\.?|ft\\.?|featuring)\\s.*$");
    private static final Pattern PIPE = Pattern.compile("\\s*[|｜].*$");
    private static final Pattern DASH = Pattern.compile("\\s+[-–—]\\s+");
    private static final Pattern JUNK_WORDS = Pattern.compile(
            "(?i)\\b(official\\s+(music\\s+)?(video|audio|lyric(s)?\\s+video|visualizer)|lyrics?\\s+video|lyrics|" +
            "music\\s+video|audio|hd|hq|4k|mv)\\b\\s*$");

    static String cleanTitle(String t) {
        String s = PIPE.matcher(t).replaceAll("");
        s = BRACKETS.matcher(s).replaceAll("");
        s = JUNK_WORDS.matcher(s).replaceAll("");
        s = FEAT.matcher(s).replaceAll("");
        return s.replace("\"", "").trim();
    }

    static String cleanArtist(String a) {
        String s = a == null ? "" : a;
        s = s.replaceAll("(?i)\\s*-\\s*topic$", "")
             .replaceAll("(?i)vevo$", "")
             .replaceAll("(?i)\\s+official$", "")
             .replaceAll("(?i)\\s*\\(official\\)$", "");
        return s.trim();
    }

    /** Different (track, artist) guesses to try, best first. */
    static List<String[]> candidates(String title, String artist) {
        String t = title == null ? "" : title.trim();
        String a = cleanArtist(artist);
        Set<String> seen = new LinkedHashSet<>();
        List<String[]> out = new ArrayList<>();

        // YouTube style "Artist - Song"
        String noBrackets = BRACKETS.matcher(PIPE.matcher(t).replaceAll("")).replaceAll("").trim();
        String[] parts = DASH.split(noBrackets, 2);
        if (parts.length == 2) {
            add(out, seen, cleanTitle(parts[1]), cleanArtist(parts[0]));
        }
        add(out, seen, t, a);
        add(out, seen, cleanTitle(t), a);
        int comma = a.indexOf(',');
        if (comma > 0) add(out, seen, cleanTitle(t), a.substring(0, comma).trim());
        if (parts.length == 2) add(out, seen, cleanTitle(parts[1]), "");
        else add(out, seen, cleanTitle(t), "");
        return out;
    }

    private static void add(List<String[]> out, Set<String> seen, String track, String artist) {
        String k = (track + "|" + artist).toLowerCase(Locale.ROOT);
        if (!track.isBlank() && seen.add(k)) out.add(new String[]{track, artist});
    }
}
