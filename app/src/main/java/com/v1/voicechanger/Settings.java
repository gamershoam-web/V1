package com.v1.voicechanger;

import android.content.Context;
import android.content.SharedPreferences;

import com.v1.voicechanger.dsp.VoiceParams;

/**
 * Shared settings. Written by the app, read by the in-call hook through LSPosed's
 * XSharedPreferences (enabled by the "xposedsharedprefs" meta-data in the manifest).
 */
public final class Settings {
    public static final String PACKAGE = "com.v1.voicechanger";
    public static final String FILE = "voice";

    public static final String K_ENABLED = "enabled";
    public static final String K_PRESET = "preset";

    /** Minimal reader so the same code works with SharedPreferences and XSharedPreferences. */
    public interface Reader {
        boolean getBoolean(String key, boolean def);

        float getFloat(String key, float def);

        String getString(String key, String def);
    }

    private Settings() {
    }

    /**
     * Opens the settings file. With LSPosed active, MODE_WORLD_READABLE is allowed and the
     * file becomes readable by hooked apps. Without LSPosed it throws, so fall back to private.
     */
    @SuppressWarnings("deprecation")
    public static SharedPreferences open(Context ctx) {
        try {
            return ctx.getSharedPreferences(FILE, Context.MODE_WORLD_READABLE);
        } catch (SecurityException e) {
            return ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        }
    }

    /** True when LSPosed lets us share preferences with hooked apps (i.e. the module is enabled). */
    @SuppressWarnings("deprecation")
    public static boolean canShareWithHookedApps(Context ctx) {
        try {
            ctx.getSharedPreferences(FILE, Context.MODE_WORLD_READABLE);
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    public static Reader reader(final SharedPreferences sp) {
        return new Reader() {
            @Override
            public boolean getBoolean(String key, boolean def) {
                return sp.getBoolean(key, def);
            }

            @Override
            public float getFloat(String key, float def) {
                return sp.getFloat(key, def);
            }

            @Override
            public String getString(String key, String def) {
                return sp.getString(key, def);
            }
        };
    }

    public static VoiceParams readParams(Reader r) {
        VoiceParams d = new VoiceParams();
        VoiceParams p = new VoiceParams();
        p.pitch = r.getFloat("pitch", d.pitch);
        p.treble = r.getFloat("treble", d.treble);
        p.robot = r.getFloat("robot", d.robot);
        p.robotFreq = r.getFloat("robotFreq", d.robotFreq);
        p.wobbleMs = r.getFloat("wobbleMs", d.wobbleMs);
        p.wobbleRate = r.getFloat("wobbleRate", d.wobbleRate);
        p.lowCut = r.getFloat("lowCut", d.lowCut);
        p.highCut = r.getFloat("highCut", d.highCut);
        p.drive = r.getFloat("drive", d.drive);
        p.echoMs = r.getFloat("echoMs", d.echoMs);
        p.echoFeedback = r.getFloat("echoFeedback", d.echoFeedback);
        p.echoMix = r.getFloat("echoMix", d.echoMix);
        p.gainDb = r.getFloat("gainDb", d.gainDb);
        return p;
    }

    public static void writeParams(SharedPreferences.Editor e, VoiceParams p) {
        e.putFloat("pitch", p.pitch)
                .putFloat("treble", p.treble)
                .putFloat("robot", p.robot)
                .putFloat("robotFreq", p.robotFreq)
                .putFloat("wobbleMs", p.wobbleMs)
                .putFloat("wobbleRate", p.wobbleRate)
                .putFloat("lowCut", p.lowCut)
                .putFloat("highCut", p.highCut)
                .putFloat("drive", p.drive)
                .putFloat("echoMs", p.echoMs)
                .putFloat("echoFeedback", p.echoFeedback)
                .putFloat("echoMix", p.echoMix)
                .putFloat("gainDb", p.gainDb);
    }
}
