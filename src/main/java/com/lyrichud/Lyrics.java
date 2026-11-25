package com.lyrichud;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Time-synced lyrics parsed from the LRC format. */
public final class Lyrics {
    public record Word(String text, long startMs) {}

    public record Line(long timeMs, String text, List<Word> words) {
        public boolean isBlank() { return text.isBlank(); }
    }

    private static final Pattern TIME = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?]");
    private static final Pattern WORD_TIME = Pattern.compile("<(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?>");

    public final List<Line> lines;

    private Lyrics(List<Line> lines) { this.lines = lines; }

    public static Lyrics parse(String lrc) {
        List<Line> out = new ArrayList<>();
        for (String raw : lrc.split("\\r?\\n")) {
            Matcher m = TIME.matcher(raw);
            List<Long> times = new ArrayList<>();
            int end = 0;
            while (m.find() && m.start() == end) {
                times.add(toMs(m.group(1), m.group(2), m.group(3)));
                end = m.end();
            }
            if (times.isEmpty()) continue;
            String rest = raw.substring(end);
            List<Word> words = new ArrayList<>();
            String text = parseWords(rest, words);
            for (long t : times) out.add(new Line(t, text, words));
        }
        out.sort((a, b) -> Long.compare(a.timeMs, b.timeMs));
        return new Lyrics(Collections.unmodifiableList(out));
    }

    /** Handles "enhanced LRC" word timestamps like <00:12.30>word. Returns the plain text. */
    private static String parseWords(String rest, List<Word> words) {
        Matcher m = WORD_TIME.matcher(rest);
        if (!m.find()) return rest.trim();
        m.reset();
        StringBuilder plain = new StringBuilder();
        long curStart = -1;
        int last = 0;
        while (m.find()) {
            addWords(rest.substring(last, m.start()), curStart, words, plain);
            curStart = toMs(m.group(1), m.group(2), m.group(3));
            last = m.end();
        }
        addWords(rest.substring(last), curStart, words, plain);
        return plain.toString().trim().replaceAll("\\s+", " ");
    }

    private static void addWords(String chunk, long start, List<Word> words, StringBuilder plain) {
        plain.append(chunk);
        for (String w : chunk.trim().split("\\s+")) {
            if (!w.isEmpty()) words.add(new Word(w, start));
        }
    }

    private static long toMs(String min, String sec, String frac) {
        long ms = Long.parseLong(min) * 60_000L + Long.parseLong(sec) * 1000L;
        if (frac != null) {
            if (frac.length() == 1) ms += Long.parseLong(frac) * 100;
            else if (frac.length() == 2) ms += Long.parseLong(frac) * 10;
            else ms += Long.parseLong(frac);
        }
        return ms;
    }

    /** Index of the line playing at {@code posMs}, or -1 before the first line. */
    public int indexAt(long posMs) {
        int lo = 0, hi = lines.size() - 1, ans = -1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            if (lines.get(mid).timeMs <= posMs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return ans;
    }

    /** Next line after {@code index} that has text, or null. */
    public Line nextNonBlank(int index) {
        for (int i = index + 1; i < lines.size(); i++) if (!lines.get(i).isBlank()) return lines.get(i);
        return null;
    }

    /** When the line at {@code index} ends (start of the following line). */
    public long lineEnd(int index, long songDurationMs) {
        if (index + 1 < lines.size()) return lines.get(index + 1).timeMs;
        long start = lines.get(index).timeMs;
        return songDurationMs > start ? Math.min(songDurationMs, start + 6000) : start + 6000;
    }
}
