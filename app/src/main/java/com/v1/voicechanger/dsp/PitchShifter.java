package com.v1.voicechanger.dsp;

/**
 * Low-latency time-domain pitch shifter.
 *
 * Two read taps sweep through a short delay line at a rate set by the pitch
 * ratio; they are half a window apart and cross-faded with sin^2 windows
 * (which always sum to 1), hiding the jump when a tap wraps around.
 * Latency is about half the window (~22 ms).
 */
final class PitchShifter {
    private static final int TABLE = 1024;
    private static final float[] WINDOW = new float[TABLE + 1];

    static {
        for (int i = 0; i <= TABLE; i++) {
            double s = Math.sin(Math.PI * i / TABLE);
            WINDOW[i] = (float) (s * s);
        }
    }

    private final float[] buf;
    private final int mask;
    private final float window;
    private int writePos;
    private float delay;
    private float ratio = 1f;

    PitchShifter(int sampleRate) {
        window = sampleRate * 0.045f;
        int size = 1;
        while (size < window * 2 + 8) size <<= 1;
        buf = new float[size];
        mask = size - 1;
    }

    void setSemitones(float semitones) {
        ratio = (float) Math.pow(2.0, semitones / 12.0);
    }

    float process(float x) {
        buf[writePos] = x;
        float d1 = delay;
        float d2 = delay + window * 0.5f;
        if (d2 >= window) d2 -= window;
        float y = tap(d1) * win(d1) + tap(d2) * win(d2);

        delay += 1f - ratio;
        if (delay < 0) delay += window;
        else if (delay >= window) delay -= window;
        writePos = (writePos + 1) & mask;
        return y;
    }

    private float win(float d) {
        return WINDOW[(int) (d / window * TABLE)];
    }

    private float tap(float d) {
        float pos = writePos - d;
        int i = (int) Math.floor(pos);
        float frac = pos - i;
        float a = buf[i & mask];
        float b = buf[(i + 1) & mask];
        return a + (b - a) * frac;
    }
}
