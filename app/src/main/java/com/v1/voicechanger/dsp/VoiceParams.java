package com.v1.voicechanger.dsp;

/** All tunable parameters of the voice effect chain. */
public final class VoiceParams {
    /** Pitch shift in semitones (-12..+12). */
    public float pitch;
    /** High-shelf tone at 3 kHz in dB (-12..+12). Brighter = more "feminine"/small. */
    public float treble;
    /** Ring-modulator mix 0..1 (robot / dalek). */
    public float robot;
    /** Ring-modulator carrier in Hz. */
    public float robotFreq = 60f;
    /** Vibrato depth in milliseconds (0..8) – alien / drunk wobble. */
    public float wobbleMs;
    /** Vibrato rate in Hz. */
    public float wobbleRate = 5f;
    /** High-pass cutoff in Hz (0 = off). */
    public float lowCut;
    /** Low-pass cutoff in Hz (0 = off). */
    public float highCut;
    /** Distortion amount 0..1. */
    public float drive;
    /** Echo delay in ms. */
    public float echoMs = 180f;
    /** Echo feedback 0..0.9. */
    public float echoFeedback = 0.35f;
    /** Echo wet level 0..1 (0 = no echo). */
    public float echoMix;
    /** Output gain in dB (-12..+12). */
    public float gainDb;

    public VoiceParams copy() {
        VoiceParams p = new VoiceParams();
        p.pitch = pitch;
        p.treble = treble;
        p.robot = robot;
        p.robotFreq = robotFreq;
        p.wobbleMs = wobbleMs;
        p.wobbleRate = wobbleRate;
        p.lowCut = lowCut;
        p.highCut = highCut;
        p.drive = drive;
        p.echoMs = echoMs;
        p.echoFeedback = echoFeedback;
        p.echoMix = echoMix;
        p.gainDb = gainDb;
        return p;
    }
}
