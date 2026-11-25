package com.v1.voicechanger.dsp;

/**
 * Mono voice effect chain:
 * gain -> low cut -> pitch -> wobble -> robot -> drive -> high cut -> treble -> echo -> limiter.
 */
public final class VoiceProcessor {
    private final int sampleRate;
    private final Biquad lowCut = new Biquad();
    private final Biquad highCut = new Biquad();
    private final Biquad treble = new Biquad();
    private final PitchShifter pitch;

    // modulated delay for wobble
    private final float[] wob;
    private final int wobMask;
    private int wobPos;
    private double wobPhase;

    // echo
    private final float[] echo;
    private int echoPos;

    private double ringPhase;
    private VoiceParams p = new VoiceParams();
    private boolean pitchOn;
    private float gain = 1f;
    private float driveK;
    private int echoDelay;

    public VoiceProcessor(int sampleRate) {
        this.sampleRate = sampleRate;
        pitch = new PitchShifter(sampleRate);
        int size = 1;
        while (size < sampleRate * 0.02f) size <<= 1;
        wob = new float[size];
        wobMask = size - 1;
        echo = new float[sampleRate + 1];
    }

    public void setParams(VoiceParams params) {
        VoiceParams n = params.copy();
        pitchOn = Math.abs(n.pitch) > 0.01f;
        pitch.setSemitones(n.pitch);
        if (n.lowCut > 0) lowCut.setHighPass(sampleRate, n.lowCut, 0.707f);
        else lowCut.setBypass();
        if (n.highCut > 0) highCut.setLowPass(sampleRate, n.highCut, 0.707f);
        else highCut.setBypass();
        if (Math.abs(n.treble) > 0.1f) treble.setHighShelf(sampleRate, 3000f, n.treble);
        else treble.setBypass();
        gain = (float) Math.pow(10, n.gainDb / 20.0);
        driveK = 1f + n.drive * 20f;
        echoDelay = Math.max(1, Math.min(echo.length - 1, (int) (n.echoMs * sampleRate / 1000f)));
        n.echoFeedback = Math.max(0f, Math.min(0.9f, n.echoFeedback));
        n.wobbleMs = Math.max(0f, Math.min(8f, n.wobbleMs));
        p = n;
    }

    public float process(float x) {
        final VoiceParams p = this.p;
        x *= gain;
        x = lowCut.process(x);
        if (pitchOn) x = pitch.process(x) * 1.35f; // make up the ~3 dB lost in the tap cross-fade

        if (p.wobbleMs > 0.01f) {
            wob[wobPos] = x;
            wobPhase += 2 * Math.PI * p.wobbleRate / sampleRate;
            if (wobPhase > 2 * Math.PI) wobPhase -= 2 * Math.PI;
            float depth = p.wobbleMs * sampleRate / 1000f;
            float d = 1f + depth * (1f + (float) Math.sin(wobPhase)) * 0.5f;
            float pos = wobPos - d;
            int i = (int) Math.floor(pos);
            float f = pos - i;
            float a = wob[i & wobMask], b = wob[(i + 1) & wobMask];
            x = a + (b - a) * f;
            wobPos = (wobPos + 1) & wobMask;
        }

        if (p.robot > 0.001f) {
            ringPhase += 2 * Math.PI * p.robotFreq / sampleRate;
            if (ringPhase > 2 * Math.PI) ringPhase -= 2 * Math.PI;
            float carrier = (float) Math.sin(ringPhase);
            x = x * (1f - p.robot) + x * carrier * p.robot * 1.4f;
        }

        if (p.drive > 0.001f) {
            float shaped = (float) Math.tanh(x * driveK) / (float) Math.sqrt(driveK);
            x = x * (1f - p.drive) + shaped * p.drive * 1.5f;
        }

        x = highCut.process(x);
        x = treble.process(x);

        if (p.echoMix > 0.001f) {
            int readPos = echoPos - echoDelay;
            if (readPos < 0) readPos += echo.length;
            float delayed = echo[readPos];
            echo[echoPos] = x + delayed * p.echoFeedback;
            echoPos++;
            if (echoPos >= echo.length) echoPos = 0;
            x = x + delayed * p.echoMix;
        }

        return softLimit(x);
    }

    private static float softLimit(float x) {
        float a = Math.abs(x);
        if (a <= 0.8f) return x;
        float y = 0.8f + 0.2f * (float) Math.tanh((a - 0.8f) / 0.2f);
        return x < 0 ? -y : y;
    }
}
