package com.lyrichud;

import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * V2 "world" mode: each lyric line appears in the world in front of you, stays at that spot
 * (walking does not move it), keeps turning to face you, and slowly fades away when done.
 */
public final class WorldLyricRenderer {
    private static final int FULL_BRIGHT = 0xF000F0;
    private static final float ROW_H = 10.5f;

    /** One line floating in the world. */
    private static final class Floating {
        final List<Run> runs;            // the words
        final Lyrics.Line line;          // null for the song-title card
        final long lineEnd;
        final Vec3d pos;
        final long born;
        final float size;
        long fadeAt = Long.MAX_VALUE;
        float yaw, pitch;
        boolean aimed;

        Floating(List<Run> runs, Lyrics.Line line, long lineEnd, Vec3d pos, long born, float size) {
            this.runs = runs; this.line = line; this.lineEnd = lineEnd; this.pos = pos; this.born = born; this.size = size;
        }
    }

    /** A word (or piece of text) in one colour. */
    private record Run(String text, int color, float alpha) {}

    private final List<Floating> floating = new ArrayList<>();
    private String songKey = "";
    private int lastIndex = Integer.MIN_VALUE;
    private int spawnCount;
    private Object lastWorld;
    private long lastFrame;

    public void clear() {
        floating.clear();
        songKey = "";
        lastIndex = Integer.MIN_VALUE;
    }

    public void render(WorldRenderContext ctx) {
        MinecraftClient mc = MinecraftClient.getInstance();
        LyricHudClient hud = LyricHudClient.get();
        if (hud == null || mc.world == null) return;
        LyricConfig cfg = hud.config();
        if (!cfg.enabled || !cfg.worldMode()) return;

        if (mc.world != lastWorld) { lastWorld = mc.world; clear(); }

        long now = System.currentTimeMillis();
        float dt = lastFrame == 0 ? 0.016f : Math.min(0.25f, (now - lastFrame) / 1000f);
        lastFrame = now;
        Camera cam = mc.gameRenderer.getCamera();
        int white = LyricConfig.parseColor(cfg.textColor, 0xFFFFFFFF);
        int accent = LyricConfig.parseColor(cfg.highlightColor, 0xFFC792FF);

        update(hud, cfg, cam, now, white, accent);

        TextRenderer tr = mc.textRenderer;
        MatrixStack ms = ctx.matrices();
        VertexConsumerProvider vc = ctx.consumers();
        TextRenderer.TextLayerType layer = cfg.seeThroughBlocks ? TextRenderer.TextLayerType.SEE_THROUGH : TextRenderer.TextLayerType.NORMAL;
        Vec3d camPos = cam.getCameraPos();
        long fadeMs = Math.max(200, (long) (cfg.fadeSeconds * 1000));

        NowPlaying np = hud.nowPlaying();
        long songPos = np == null ? 0 : np.positionNow() - cfg.offsetMs;

        // draw far lines first so near ones end up on top
        floating.sort((a, b) -> Double.compare(b.pos.squaredDistanceTo(camPos), a.pos.squaredDistanceTo(camPos)));

        for (Iterator<Floating> it = floating.iterator(); it.hasNext(); ) {
            Floating f = it.next();
            float fade = now < f.fadeAt ? 0 : (now - f.fadeAt) / (float) fadeMs;
            if (fade >= 1) { it.remove(); continue; }
            drawFloating(f, fade, now, songPos, dt, cfg, tr, ms, vc, layer, camPos, accent);
        }
    }

    // =====================================================================================
    // Which lines exist

    private void update(LyricHudClient hud, LyricConfig cfg, Camera cam, long now, int white, int accent) {
        NowPlaying np = hud.nowPlaying();
        if (np == null) {
            fadeAll(now);
            songKey = "";
            return;
        }
        if (!np.key().equals(songKey)) {
            songKey = np.key();
            lastIndex = Integer.MIN_VALUE;
            fadeAll(now);
            if (cfg.showSongInfo) {
                List<Run> card = new ArrayList<>();
                card.add(new Run("♪ " + np.title(), accent, 1f));
                if (!np.artist().isBlank()) card.add(new Run("  " + np.artist(), white, 0.75f));
                Floating info = spawn(card, null, 0, cam, cfg, now, 0.6f, true);
                info.fadeAt = now + 3500;
            }
        }

        LyricsService.Result res = hud.lyricsFor(np);
        if (res.status() != LyricsService.Status.FOUND) return;
        Lyrics lyrics = res.lyrics();
        long pos = np.positionNow() - cfg.offsetMs;
        int idx = lyrics.indexAt(pos);

        if (idx != lastIndex) {
            boolean normalStep = lastIndex != Integer.MIN_VALUE && idx > lastIndex && idx - lastIndex <= 2;
            for (Floating f : floating) {
                if (f.line != null) f.fadeAt = Math.min(f.fadeAt, normalStep ? now + 450 : now);
            }
            if (idx >= 0) {
                Lyrics.Line line = lyrics.lines.get(idx);
                if (!line.isBlank() && !line.words().isEmpty()) {
                    List<Run> runs = new ArrayList<>();
                    for (int i = 0; i < line.words().size(); i++) {
                        runs.add(new Run(line.words().get(i).text() + (i + 1 < line.words().size() ? " " : ""), white, 1f));
                    }
                    spawn(runs, line, lyrics.lineEnd(idx, np.durationMs()), cam, cfg, now, 1f, false);
                }
            }
            lastIndex = idx;
        }

        // During a long instrumental break, let the current line go.
        for (Floating f : floating) {
            if (f.line == null || f.fadeAt != Long.MAX_VALUE) continue;
            long wordsEnd = wordTimes(f.line, f.lineEnd).get(f.line.words().size() - 1)[1];
            if (pos > wordsEnd + 3000 && f.lineEnd - pos > 1500) f.fadeAt = now;
        }
    }

    private void fadeAll(long now) {
        for (Floating f : floating) f.fadeAt = Math.min(f.fadeAt, now);
    }

    /** Place a new line in front of where the player is looking. */
    private Floating spawn(List<Run> runs, Lyrics.Line line, long lineEnd, Camera cam, LyricConfig cfg,
                           long now, float size, boolean infoCard) {
        float yaw = cam.getYaw();
        float pitch = Math.max(-25f, Math.min(15f, cam.getPitch()));
        double yr = Math.toRadians(yaw), pr = Math.toRadians(pitch);
        Vec3d forward = new Vec3d(-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr));
        Vec3d right = new Vec3d(-Math.cos(yr), 0, -Math.sin(yr));

        // Alternate centre / left / right so a new line doesn't sit on top of the fading one.
        double side = 0, up = 0;
        if (!infoCard) {
            int slot = spawnCount++ % 4;
            side = switch (slot) { case 1 -> -1.6; case 3 -> 1.6; default -> 0; };
            up = switch (slot) { case 1 -> 0.35; case 2 -> -0.3; case 3 -> 0.2; default -> 0; };
        } else {
            up = -1.1;
        }
        double dist = cfg.worldDistance;
        Vec3d pos = cam.getCameraPos()
                .add(forward.multiply(dist))
                .add(0, cfg.worldHeight + up, 0)
                .add(right.multiply(side * dist / 9.0));
        Floating f = new Floating(runs, line, lineEnd, pos, now, size);
        floating.add(f);
        return f;
    }

    // =====================================================================================
    // Drawing one line

    private void drawFloating(Floating f, float fade, long now, long songPos, float dt, LyricConfig cfg,
                              TextRenderer tr, MatrixStack ms, VertexConsumerProvider vc,
                              TextRenderer.TextLayerType layer, Vec3d camPos, int accent) {
        // turn to face the player (smoothly)
        Vec3d d = camPos.subtract(f.pos);
        float targetYaw = (float) Math.atan2(d.x, d.z);
        float targetPitch = (float) Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z));
        if (!f.aimed) { f.yaw = targetYaw; f.pitch = targetPitch; f.aimed = true; }
        float k = 1f - (float) Math.exp(-dt * 6);
        f.yaw += wrap(targetYaw - f.yaw) * k;
        f.pitch += (targetPitch - f.pitch) * k;

        long age = now - f.born;
        float appearAll = easeOut(clamp(age / 350f));
        float fadeEase = fade * fade;
        float alpha = 1f - fadeEase;
        float rise = fade * 0.5f + (1 - appearAll) * -0.15f;
        float scale = cfg.worldScale * f.size * (0.92f + 0.08f * appearAll) * (1f + 0.12f * fade);

        ms.push();
        ms.translate(f.pos.x - camPos.x, f.pos.y - camPos.y + rise, f.pos.z - camPos.z);
        ms.multiply(new org.joml.Quaternionf().rotationY(f.yaw).rotateX(-f.pitch));
        ms.scale(scale, -scale, scale);

        // active word
        int active = -1;
        List<long[]> timing = null;
        if (f.line != null) {
            timing = wordTimes(f.line, f.lineEnd);
            for (int i = 0; i < timing.size(); i++) if (timing.get(i)[0] <= songPos) active = i;
            if (active >= 0 && songPos > timing.get(timing.size() - 1)[1] + 400) active = -1;
            if (fade > 0) active = -1;
        }

        // word wrap
        List<List<Integer>> rows = new ArrayList<>();
        List<Integer> row = new ArrayList<>();
        float w = 0;
        for (int i = 0; i < f.runs.size(); i++) {
            float rw = tr.getWidth(f.runs.get(i).text());
            if (!row.isEmpty() && w + rw > cfg.maxLineWidth) { rows.add(row); row = new ArrayList<>(); w = 0; }
            row.add(i);
            w += rw;
        }
        rows.add(row);

        float top = -rows.size() * ROW_H / 2f;
        int charIndex = 0;
        float blur = fade * 5f;
        for (int r = 0; r < rows.size(); r++) {
            List<Integer> rr = rows.get(r);
            float rowW = 0;
            for (int i = 0; i < rr.size(); i++) {
                String t = f.runs.get(rr.get(i)).text();
                rowW += tr.getWidth(i == rr.size() - 1 ? t.stripTrailing() : t);
            }
            float x = -rowW / 2f;
            float y = top + r * ROW_H;
            for (int idx : rr) {
                Run run = f.runs.get(idx);
                boolean lit = idx == active;
                float pop = 1f;
                if (lit) pop = 1.12f + 0.12f * (1f - clamp((songPos - timing.get(idx)[0]) / 220f));
                int color = lit ? accent : run.color();
                for (int i = 0; i < run.text().length(); ) {
                    int cp = run.text().codePointAt(i);
                    String ch = new String(Character.toChars(cp));
                    i += Character.charCount(cp);
                    float cw = tr.getWidth(ch);
                    float appear = easeOut(clamp((age - charIndex * 14f) / 220f));
                    charIndex++;
                    float a = alpha * run.alpha() * appear;
                    if (cp != ' ' && a > 0.02f) {
                        drawChar(tr, ms, vc, layer, ch, x, y + (1 - appear) * 4f, cw, pop, color, a, lit, blur, accent);
                    }
                    x += cw;
                }
            }
        }
        ms.pop();
    }

    /** One letter with a 3D edge behind it, a glow if it's being sung, and a smear while fading. */
    private void drawChar(TextRenderer tr, MatrixStack ms, VertexConsumerProvider vc, TextRenderer.TextLayerType layer,
                          String ch, float x, float y, float cw, float pop, int color, float a,
                          boolean lit, float blur, int accent) {
        ms.push();
        ms.translate(x + cw / 2f, y + 4f, 0);
        if (pop != 1f) { ms.scale(pop, pop, pop); ms.translate(0, -0.6f * (pop - 1f) * 8f, 0); }
        ms.translate(-cw / 2f, -4f, 0);

        int edge = lit ? 0x4A1D86 : 0x5C5470;
        // 3D edge: darker copies stacked behind the letter
        for (int layerN = 3; layerN >= 1; layerN--) {
            ms.push();
            ms.translate(0.35f * layerN, 0.35f * layerN, -0.5f * layerN);
            draw(tr, ms, vc, layer, ch, argb(edge, a * 0.9f));
            ms.pop();
        }
        if (lit) {
            int glow = argb(accent, a * 0.25f);
            for (float[] o : new float[][]{{-0.8f, 0}, {0.8f, 0}, {0, -0.8f}, {0, 0.8f}}) {
                ms.push();
                ms.translate(o[0], o[1], -0.1f);
                draw(tr, ms, vc, layer, ch, glow);
                ms.pop();
            }
        }
        if (blur > 0.2f) {
            int ghost = argb(color, a * 0.3f);
            for (float o : new float[]{-blur, blur, -blur * 0.5f, blur * 0.5f}) {
                ms.push();
                ms.translate(o, 0, -0.05f);
                draw(tr, ms, vc, layer, ch, ghost);
                ms.pop();
            }
        }
        draw(tr, ms, vc, layer, ch, argb(color, a));
        ms.pop();
    }

    private static void draw(TextRenderer tr, MatrixStack ms, VertexConsumerProvider vc,
                             TextRenderer.TextLayerType layer, String ch, int argb) {
        if ((argb >>> 24) < 4) return;
        Matrix4f m = ms.peek().getPositionMatrix();
        tr.draw(ch, 0, 0, argb, false, m, vc, layer, 0, FULL_BRIGHT);
    }

    // =====================================================================================

    /** Same word timing as the corner mode. */
    static List<long[]> wordTimes(Lyrics.Line line, long lineEnd) {
        List<Lyrics.Word> ws = line.words();
        List<long[]> out = new ArrayList<>(ws.size());
        boolean tagged = !ws.isEmpty() && ws.stream().allMatch(w -> w.startMs() >= 0);
        if (tagged) {
            for (int i = 0; i < ws.size(); i++) {
                long s = ws.get(i).startMs();
                long e = i + 1 < ws.size() ? ws.get(i + 1).startMs() : Math.min(lineEnd, s + 800);
                out.add(new long[]{s, e});
            }
            return out;
        }
        int letters = 0;
        for (Lyrics.Word w : ws) letters += w.text().length() + 2;
        long gap = Math.max(300, lineEnd - line.timeMs() - 150);
        long dur = Math.min(gap, Math.max(900, letters * 75L));
        long t = line.timeMs();
        for (Lyrics.Word w : ws) {
            long d = dur * (w.text().length() + 2) / Math.max(1, letters);
            out.add(new long[]{t, t + d});
            t += d;
        }
        return out;
    }

    private static int argb(int rgb, float a) {
        int al = Math.round(clamp(a) * 255f);
        return (al << 24) | (rgb & 0xFFFFFF);
    }

    private static float wrap(float a) {
        while (a > Math.PI) a -= (float) (2 * Math.PI);
        while (a < -Math.PI) a += (float) (2 * Math.PI);
        return a;
    }

    private static float clamp(float f) { return f < 0 ? 0 : (f > 1 ? 1 : f); }

    private static float easeOut(float t) { float i = 1 - t; return 1 - i * i * i; }
}
