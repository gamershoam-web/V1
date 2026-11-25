package com.lyrichud;

import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import org.joml.Matrix3f;
import org.joml.Matrix3x2f;
import org.joml.Matrix3x2fStack;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.List;

/**
 * Draws the lyrics as a tilted 3D panel pinned to the top-right corner of the screen.
 * Every letter is projected with real perspective (far side smaller), so it looks like
 * text standing in the world, but it never moves with the camera.
 */
public final class LyricHudRenderer implements HudElement {
    private static final float INFO_SIZE = 0.6f;
    private static final float NEXT_SIZE = 0.62f;
    private static final float ROW_GAP = 1.5f;

    // ---- line change animation state ----
    private String songKey = "";
    private int shownIndex = Integer.MIN_VALUE;
    private Lyrics.Line shownLine, previousLine;
    private long changedAt;

    private static final boolean DEBUG = Boolean.getBoolean("lyrichud.debug");
    private long lastDbg;
    private int dbgGlyphs;

    // ---- projection ----
    private final Matrix3f rot = new Matrix3f();
    private final Vector3f tmp = new Vector3f();
    private float centerX, centerY, anchorX, anchorY, focal, baseScale;
    private float px, py; // result of project()

    @Override
    public void render(DrawContext ctx, RenderTickCounter tickCounter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        LyricHudClient hud = LyricHudClient.get();
        if (DEBUG && System.currentTimeMillis() - lastDbg > 2000) {
            lastDbg = System.currentTimeMillis();
            LyricHudClient.LOG.info("DBG render hud={} hidden={} np={}", hud != null, mc.options.hudHidden, hud == null ? null : hud.nowPlaying());
        }
        if (hud == null || mc.options.hudHidden || mc.getDebugHud().shouldShowDebugHud()) return;
        LyricConfig cfg = hud.config();
        if (!cfg.enabled) return;

        NowPlaying np = hud.nowPlaying();
        if (np == null) { songKey = ""; return; }
        LyricsService.Result lyr = hud.lyricsFor(np);

        long now = System.currentTimeMillis();
        long pos = np.positionNow() - cfg.offsetMs;

        setupProjection(ctx, cfg);
        TextRenderer tr = mc.textRenderer;
        int white = LyricConfig.parseColor(cfg.textColor, 0xFFFFFFFF);
        int accent = LyricConfig.parseColor(cfg.highlightColor, 0xFFC792FF);
        float master = np.playing() ? 1f : 0.6f;

        float v = 0;
        if (cfg.showSongInfo) {
            List<Glyphs> info = new ArrayList<>();
            info.add(new Glyphs((np.playing() ? "♪ " : "|| "), white, 0.7f));
            info.add(new Glyphs(np.title(), accent, 0.95f));
            if (!np.artist().isBlank()) info.add(new Glyphs(" · " + np.artist(), white, 0.75f));
            if (np.durationMs() > 0) info.add(new Glyphs("  " + time(np.positionNow()) + " / " + time(np.durationMs()), white, 0.6f));
            drawRow(ctx, tr, fit(tr, info, cfg.maxLineWidth / INFO_SIZE * 1.15f), v, INFO_SIZE, master, 1f);
            v += 9 * INFO_SIZE + 4;
        }

        if (!np.key().equals(songKey)) {
            songKey = np.key();
            shownIndex = Integer.MIN_VALUE;
            shownLine = previousLine = null;
        }

        if (lyr.status() != LyricsService.Status.FOUND) {
            String msg = switch (lyr.status()) {
                case SEARCHING -> "searching lyrics...";
                case INSTRUMENTAL -> "instrumental";
                case ERROR -> "couldn't reach the lyrics site";
                default -> "no synced lyrics found";
            };
            drawRow(ctx, tr, List.of(new Glyphs(msg, white, 0.45f)), v, NEXT_SIZE, master, 1f);
            return;
        }

        Lyrics lyrics = lyr.lyrics();
        int idx = lyrics.indexAt(pos);
        if (idx != shownIndex) {
            previousLine = shownLine;
            shownLine = idx >= 0 ? lyrics.lines.get(idx) : null;
            shownIndex = idx;
            changedAt = now;
        }
        long age = now - changedAt;

        // Fade the current line down during long instrumental breaks.
        float restFade = 1f;
        Lyrics.Line cur = shownLine;
        long wordsEnd = 0;
        List<long[]> timing = null;
        if (cur != null && (cur.isBlank() || cur.words().isEmpty())) cur = null;
        if (cur != null) {
            long end = lyrics.lineEnd(idx, np.durationMs());
            timing = wordTimes(cur, end, tr);
            wordsEnd = timing.get(timing.size() - 1)[1];
            if (pos > wordsEnd + 2500 && end - pos > 1500) restFade = 0.35f;
        }

        float linesTop = v;
        float rowH = 9 + ROW_GAP;
        float k = 1f;

        // previous line: slides up and fades out
        float outT = clamp(age / 220f);
        if (previousLine != null && !previousLine.isBlank() && outT < 1f) {
            float pv = linesTop - outT * 8;
            for (List<Glyphs> row : wrap(tr, plainGlyphs(previousLine, white), cfg.maxLineWidth)) {
                drawRow(ctx, tr, row, pv, k, master * (1 - outT), 1f);
                pv += rowH * k;
            }
        }

        // current line: letters pop in left to right, sung word lights up
        float after = linesTop;
        if (cur != null) {
            List<Glyphs> words = new ArrayList<>();
            int active = -1;
            for (int i = 0; i < timing.size(); i++) if (timing.get(i)[0] <= pos) active = i;
            if (pos > wordsEnd + 400) active = -1;
            for (int i = 0; i < cur.words().size(); i++) {
                String w = cur.words().get(i).text() + (i + 1 < cur.words().size() ? " " : "");
                if (i == active) {
                    float pop = 1f - clamp((pos - timing.get(i)[0]) / 220f);
                    words.add(new Glyphs(w, accent, 1f).lit(1f + 0.12f * pop));
                } else {
                    words.add(new Glyphs(w, white, 1f));
                }
            }
            float cv = linesTop;
            int charIndex = 0;
            for (List<Glyphs> row : wrap(tr, words, cfg.maxLineWidth)) {
                charIndex = drawRowAnimated(ctx, tr, row, cv, k, master * restFade, age, charIndex);
                cv += rowH * k;
            }
            after = cv;
        }

        // upcoming line, small and faded
        if (cfg.showNextLine) {
            Lyrics.Line next = lyrics.nextNonBlank(idx);
            if (next != null) {
                List<List<Glyphs>> rows = wrap(tr, plainGlyphs(next, white), cfg.maxLineWidth / NEXT_SIZE);
                List<Glyphs> row = rows.get(0);
                if (rows.size() > 1) row = appendEllipsis(row);
                float nextFade = clamp(age / 300f);
                drawRow(ctx, tr, row, after + 2, NEXT_SIZE, master * 0.45f * Math.max(nextFade, 0.0001f), 1f);
            }
        }
    }

    // =====================================================================================
    // Layout helpers

    /** A run of text in one colour. {@code lit} > 0 marks the word being sung. */
    private static final class Glyphs {
        final String text; final int color; final float alpha; float lit;
        Glyphs(String text, int color, float alpha) { this.text = text; this.color = color; this.alpha = alpha; }
        Glyphs lit(float scale) { this.lit = scale; return this; }
    }

    private static List<Glyphs> plainGlyphs(Lyrics.Line line, int color) {
        List<Glyphs> g = new ArrayList<>();
        List<Lyrics.Word> ws = line.words();
        for (int i = 0; i < ws.size(); i++) g.add(new Glyphs(ws.get(i).text() + (i + 1 < ws.size() ? " " : ""), color, 1f));
        return g;
    }

    /** Word wrap into rows no wider than {@code maxWidth} font pixels. */
    private static List<List<Glyphs>> wrap(TextRenderer tr, List<Glyphs> words, float maxWidth) {
        List<List<Glyphs>> rows = new ArrayList<>();
        List<Glyphs> row = new ArrayList<>();
        float w = 0;
        for (Glyphs g : words) {
            float gw = tr.getWidth(g.text.stripTrailing());
            if (!row.isEmpty() && w + gw > maxWidth) {
                rows.add(row);
                row = new ArrayList<>();
                w = 0;
            }
            row.add(g);
            w += tr.getWidth(g.text);
        }
        if (!row.isEmpty() || rows.isEmpty()) rows.add(row);
        return rows;
    }

    /** Shorten a single row (the song info) to fit. */
    private static List<Glyphs> fit(TextRenderer tr, List<Glyphs> row, float maxWidth) {
        float total = 0;
        for (Glyphs g : row) total += tr.getWidth(g.text);
        if (total <= maxWidth) return row;
        // shorten the title (index 1) first
        List<Glyphs> out = new ArrayList<>(row);
        Glyphs t = out.get(1);
        String s = t.text;
        while (s.length() > 4 && total > maxWidth) {
            total -= tr.getWidth(s);
            s = s.substring(0, s.length() - 1);
            total += tr.getWidth(s + "...");
        }
        out.set(1, new Glyphs(s.stripTrailing() + "...", t.color, t.alpha));
        return out;
    }

    private static List<Glyphs> appendEllipsis(List<Glyphs> row) {
        List<Glyphs> out = new ArrayList<>(row);
        Glyphs last = out.get(out.size() - 1);
        out.set(out.size() - 1, new Glyphs(last.text.stripTrailing() + "...", last.color, last.alpha));
        return out;
    }

    private static float rowWidth(TextRenderer tr, List<Glyphs> row) {
        float w = 0;
        for (int i = 0; i < row.size(); i++) {
            String t = i == row.size() - 1 ? row.get(i).text.stripTrailing() : row.get(i).text;
            w += tr.getWidth(t);
        }
        return w;
    }

    /**
     * Start/end time of every word. Uses word timestamps from the lyrics when present,
     * otherwise spreads the words over the line, longer words taking longer.
     */
    private static List<long[]> wordTimes(Lyrics.Line line, long lineEnd, TextRenderer tr) {
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

    // =====================================================================================
    // Drawing

    private void drawRow(DrawContext ctx, TextRenderer tr, List<Glyphs> row, float v, float k, float alpha, float unused) {
        float x = -rowWidth(tr, row) * k;
        for (Glyphs g : row) {
            for (int i = 0; i < g.text.length(); ) {
                int cp = g.text.codePointAt(i);
                String ch = new String(Character.toChars(cp));
                i += Character.charCount(cp);
                float w = tr.getWidth(ch);
                if (cp != ' ') glyph(ctx, tr, ch, x, v, w, k, k, withAlpha(g.color, alpha * g.alpha), true);
                x += w * k;
            }
        }
    }

    private int drawRowAnimated(DrawContext ctx, TextRenderer tr, List<Glyphs> row, float v, float k,
                                float alpha, long age, int charIndex) {
        float x = -rowWidth(tr, row) * k;
        for (Glyphs g : row) {
            for (int i = 0; i < g.text.length(); ) {
                int cp = g.text.codePointAt(i);
                String ch = new String(Character.toChars(cp));
                i += Character.charCount(cp);
                float w = tr.getWidth(ch);
                float appear = easeOut(clamp((age - charIndex * 9f) / 170f));
                charIndex++;
                if (cp != ' ' && appear > 0.01f) {
                    float a = alpha * g.alpha * appear;
                    float lift = (1 - appear) * 5;
                    if (g.lit > 0) {
                        float s = k * g.lit;
                        float yUp = -(g.lit - 1) * 4.5f * k;
                        // soft glow behind the sung word
                        int glow = withAlpha(g.color, a * 0.22f);
                        glyph(ctx, tr, ch, x - 0.7f * k, v + yUp + lift, w, k, s, glow, false);
                        glyph(ctx, tr, ch, x + 0.7f * k, v + yUp + lift, w, k, s, glow, false);
                        glyph(ctx, tr, ch, x, v + yUp + lift - 0.7f * k, w, k, s, glow, false);
                        glyph(ctx, tr, ch, x, v + yUp + lift + 0.7f * k, w, k, s, glow, false);
                        glyph(ctx, tr, ch, x, v + yUp + lift, w, k, s, withAlpha(g.color, a), true);
                    } else {
                        glyph(ctx, tr, ch, x, v + lift, w, k, k, withAlpha(g.color, a), true);
                    }
                }
                x += w * k;
            }
        }
        return charIndex;
    }

    /**
     * Draws one letter. (u, v) is its top-left corner on the tilted panel, in font pixels.
     * The letter is drawn with the local perspective of that spot on the panel.
     */
    private void glyph(DrawContext ctx, TextRenderer tr, String ch, float u, float v, float w,
                       float layoutScale, float drawScale, int argb, boolean shadow) {
        if ((argb >>> 24) < 5) return;
        float cu = u + w * layoutScale / 2f, cv = v + 4.5f * layoutScale;
        if (!project(cu, cv)) return;
        float x0 = px, y0 = py;
        if (DEBUG && dbgGlyphs++ % 2000 == 0) LyricHudClient.LOG.info("DBG glyph '{}' at {},{} color {}", ch, x0, y0, Integer.toHexString(argb));
        if (!project(cu + 1, cv)) return;
        float ax = px - x0, ay = py - y0;
        if (!project(cu, cv + 1)) return;
        float bx = px - x0, by = py - y0;

        Matrix3x2fStack m = ctx.getMatrices();
        m.pushMatrix();
        m.mul(new Matrix3x2f(ax * drawScale, ay * drawScale, bx * drawScale, by * drawScale, x0, y0));
        m.translate(-w / 2f, -4.5f);
        ctx.drawText(MinecraftClient.getInstance().textRenderer, ch, 0, 0, argb, shadow);
        m.popMatrix();
    }

    private void setupProjection(DrawContext ctx, LyricConfig cfg) {
        float sw = ctx.getScaledWindowWidth(), sh = ctx.getScaledWindowHeight();
        centerX = sw / 2f;
        centerY = sh / 2f;
        anchorX = sw - cfg.marginRight;
        anchorY = cfg.marginTop;
        focal = sw * 0.75f;
        baseScale = cfg.scale;
        rot.identity()
           .rotateZ((float) Math.toRadians(cfg.rollDeg))
           .rotateY((float) Math.toRadians(cfg.yawDeg))
           .rotateX((float) Math.toRadians(-cfg.pitchDeg));
    }

    /** Panel point (u, v) to screen, written into px/py. False if behind the viewer. */
    private boolean project(float u, float v) {
        tmp.set(u * baseScale, v * baseScale, 0);
        rot.transform(tmp);
        float X = anchorX - centerX + tmp.x;
        float Y = anchorY - centerY + tmp.y;
        float depth = focal + tmp.z;
        if (depth < focal * 0.2f) return false;
        float d = focal / depth;
        px = centerX + X * d;
        py = centerY + Y * d;
        return true;
    }

    private static int withAlpha(int rgb, float a) {
        int al = Math.round(clamp(a) * ((rgb >>> 24) / 255f) * 255f);
        return (al << 24) | (rgb & 0xFFFFFF);
    }

    private static float clamp(float f) { return f < 0 ? 0 : (f > 1 ? 1 : f); }

    private static float easeOut(float t) { float i = 1 - t; return 1 - i * i * i; }

    private static String time(long ms) {
        long s = Math.max(0, ms / 1000);
        return (s / 60) + ":" + String.format("%02d", s % 60);
    }
}
