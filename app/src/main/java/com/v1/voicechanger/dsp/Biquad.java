package com.v1.voicechanger.dsp;

/** RBJ-cookbook biquad filter (transposed direct form II). */
final class Biquad {
    private float b0 = 1, b1, b2, a1, a2;
    private float z1, z2;
    private boolean bypass = true;

    void setBypass() {
        bypass = true;
    }

    void setHighPass(float sampleRate, float freq, float q) {
        double w = 2 * Math.PI * clampFreq(freq, sampleRate) / sampleRate;
        double cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        double a0 = 1 + alpha;
        set((1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, -2 * cos / a0, (1 - alpha) / a0);
    }

    void setLowPass(float sampleRate, float freq, float q) {
        double w = 2 * Math.PI * clampFreq(freq, sampleRate) / sampleRate;
        double cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        double a0 = 1 + alpha;
        set((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, -2 * cos / a0, (1 - alpha) / a0);
    }

    void setHighShelf(float sampleRate, float freq, float gainDb) {
        double A = Math.pow(10, gainDb / 40.0);
        double w = 2 * Math.PI * clampFreq(freq, sampleRate) / sampleRate;
        double cos = Math.cos(w), sin = Math.sin(w);
        double alpha = sin / 2 * Math.sqrt(2); // shelf slope S = 1
        double sq = 2 * Math.sqrt(A) * alpha;
        double a0 = (A + 1) - (A - 1) * cos + sq;
        set(A * ((A + 1) + (A - 1) * cos + sq) / a0,
                -2 * A * ((A - 1) + (A + 1) * cos) / a0,
                A * ((A + 1) + (A - 1) * cos - sq) / a0,
                2 * ((A - 1) - (A + 1) * cos) / a0,
                ((A + 1) - (A - 1) * cos - sq) / a0);
    }

    private static double clampFreq(float f, float sr) {
        return Math.max(10, Math.min(f, sr * 0.45f));
    }

    private void set(double nb0, double nb1, double nb2, double na1, double na2) {
        b0 = (float) nb0;
        b1 = (float) nb1;
        b2 = (float) nb2;
        a1 = (float) na1;
        a2 = (float) na2;
        bypass = false;
    }

    float process(float x) {
        if (bypass) return x;
        float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }
}
