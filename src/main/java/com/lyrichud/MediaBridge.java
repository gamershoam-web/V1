package com.lyrichud;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;

/**
 * Talks to a small PowerShell helper that reads Windows' "Now Playing" media info
 * (Spotify, or YouTube / YouTube Music in any browser). Windows only.
 */
public final class MediaBridge {
    private volatile NowPlaying current;
    private volatile Process process;
    private volatile Writer stdin;
    private volatile boolean stopped;
    private volatile String lastError;

    // smoothing of the reported position
    private String anchorKey = "";
    private long anchorPos, anchorAt;
    private boolean anchorPlaying;

    public static boolean supported() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    public NowPlaying current() { return current; }

    public String lastError() { return lastError; }

    public boolean running() { Process p = process; return p != null && p.isAlive(); }

    public void start() {
        if (!supported()) return;
        Thread t = new Thread(this::runLoop, "LyricHUD-media");
        t.setDaemon(true);
        t.start();
    }

    public void stop() {
        stopped = true;
        Process p = process;
        if (p != null) p.destroy();
    }

    public void send(String command) {
        Writer w = stdin;
        if (w == null) return;
        try {
            w.write(command + "\n");
            w.flush();
        } catch (Exception ignored) {}
    }

    private void runLoop() {
        int failures = 0;
        while (!stopped) {
            long started = System.currentTimeMillis();
            try {
                Path script = extractScript();
                ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-NoLogo", "-NoProfile",
                        "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script.toString());
                pb.redirectErrorStream(false);
                Process p = pb.start();
                process = p;
                stdin = new OutputStreamWriter(p.getOutputStream(), StandardCharsets.UTF_8);
                drain(p.getErrorStream());
                try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        handle(line.trim());
                    }
                }
                p.waitFor();
            } catch (Exception e) {
                lastError = e.toString();
                LyricHudClient.LOG.warn("Media bridge error", e);
            }
            current = null;
            if (stopped) break;
            failures = System.currentTimeMillis() - started > 30_000 ? 0 : failures + 1;
            if (failures > 5) {
                LyricHudClient.LOG.error("Media bridge keeps crashing, giving up. Last error: {}", lastError);
                break;
            }
            try { Thread.sleep(3000L * failures); } catch (InterruptedException ignored) { break; }
        }
    }

    private void handle(String line) {
        if (!line.startsWith("{")) return;
        try {
            JsonObject o = JsonParser.parseString(line).getAsJsonObject();
            if (!o.has("active") || !o.get("active").getAsBoolean()) { current = null; return; }
            String title = s(o, "title"), artist = s(o, "artist");
            if (title.isBlank()) { current = null; return; }
            boolean playing = "Playing".equalsIgnoreCase(s(o, "status"));
            long pos = o.get("pos").getAsLong();
            long end = o.get("end").getAsLong();
            long updated = o.get("updated").getAsLong();
            long psNow = o.get("now").getAsLong();
            long localNow = System.currentTimeMillis();

            // Windows gives "position at time X". Move it forward to now if playing.
            long estimate = pos;
            long since = psNow - updated;
            if (playing && updated > 0 && since >= 0 && (end <= 0 || since < end)) estimate = pos + since;

            String key = title + "\u0000" + artist;
            long extrapolated = anchorPlaying ? anchorPos + (localNow - anchorAt) : anchorPos;
            boolean sameTrack = key.equals(anchorKey);
            boolean jump = Math.abs(estimate - extrapolated) > 400;
            if (!sameTrack || playing != anchorPlaying || jump) {
                anchorKey = key;
                anchorPos = estimate;
                anchorAt = localNow;
                anchorPlaying = playing;
            }
            current = new NowPlaying(s(o, "app"), title, artist, s(o, "album"),
                    playing, anchorPos, end, anchorAt);
        } catch (Exception e) {
            lastError = "Bad data from media bridge: " + e;
        }
    }

    private static String s(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : "";
    }

    private static void drain(InputStream err) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(err, StandardCharsets.UTF_8))) {
                String l;
                while ((l = r.readLine()) != null) {
                    if (!l.isBlank()) LyricHudClient.LOG.warn("[media-bridge] {}", l);
                }
            } catch (Exception ignored) {}
        }, "LyricHUD-media-err");
        t.setDaemon(true);
        t.start();
    }

    private static Path extractScript() throws Exception {
        Path dir = FabricLoader.getInstance().getConfigDir().resolve("lyrichud");
        Files.createDirectories(dir);
        Path target = dir.resolve("media-bridge.ps1");
        try (InputStream in = MediaBridge.class.getResourceAsStream("/lyrichud/media-bridge.ps1")) {
            if (in == null) throw new IllegalStateException("media-bridge.ps1 missing from mod jar");
            // Windows PowerShell 5 needs a BOM to read the file as UTF-8.
            byte[] body = in.readAllBytes();
            byte[] withBom = new byte[body.length + 3];
            withBom[0] = (byte) 0xEF; withBom[1] = (byte) 0xBB; withBom[2] = (byte) 0xBF;
            System.arraycopy(body, 0, withBom, 3, body.length);
            Path tmp = dir.resolve("media-bridge.ps1.tmp");
            Files.write(tmp, withBom);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }
}
