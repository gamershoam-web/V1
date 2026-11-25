package com.v1.voicechanger.xposed;

import com.v1.voicechanger.Settings;
import com.v1.voicechanger.dsp.VoiceParams;

import de.robv.android.xposed.XSharedPreferences;
import de.robv.android.xposed.XposedBridge;

/** Reads the module's settings inside the hooked app and reloads them when they change. */
final class HookConfig {
    private static final long CHECK_INTERVAL_MS = 400;

    private static XSharedPreferences prefs;
    private static long lastCheck;
    private static volatile boolean enabled;
    private static volatile VoiceParams params = new VoiceParams();
    private static volatile int version;

    private HookConfig() {
    }

    static synchronized void init() {
        if (prefs != null) return;
        try {
            prefs = new XSharedPreferences(Settings.PACKAGE, Settings.FILE);
            load();
        } catch (Throwable t) {
            XposedBridge.log("V1VoiceChanger: cannot open settings: " + t);
        }
    }

    /** Cheap to call from the audio thread; does a file stat at most every CHECK_INTERVAL_MS. */
    static void poll() {
        long now = System.currentTimeMillis();
        if (now - lastCheck < CHECK_INTERVAL_MS) return;
        synchronized (HookConfig.class) {
            if (now - lastCheck < CHECK_INTERVAL_MS) return;
            lastCheck = now;
            try {
                if (prefs != null && prefs.hasFileChanged()) {
                    prefs.reload();
                    load();
                }
            } catch (Throwable t) {
                // keep last known settings
            }
        }
    }

    private static void load() {
        final XSharedPreferences p = prefs;
        Settings.Reader r = new Settings.Reader() {
            @Override
            public boolean getBoolean(String key, boolean def) {
                return p.getBoolean(key, def);
            }

            @Override
            public float getFloat(String key, float def) {
                return p.getFloat(key, def);
            }

            @Override
            public String getString(String key, String def) {
                return p.getString(key, def);
            }
        };
        enabled = r.getBoolean(Settings.K_ENABLED, false);
        params = Settings.readParams(r);
        version++;
    }

    static boolean enabled() {
        return enabled;
    }

    static VoiceParams params() {
        return params;
    }

    static int version() {
        return version;
    }
}
