package de.robv.android.xposed;

import java.io.File;

/**
 * Compile-only stub. The real class implements android.content.SharedPreferences;
 * only the methods this module calls are declared here.
 */
public final class XSharedPreferences {
    public XSharedPreferences(String packageName, String prefFileName) {
        throw new UnsupportedOperationException("stub");
    }

    public File getFile() {
        throw new UnsupportedOperationException("stub");
    }

    public synchronized void reload() {
        throw new UnsupportedOperationException("stub");
    }

    public synchronized boolean hasFileChanged() {
        throw new UnsupportedOperationException("stub");
    }

    public boolean getBoolean(String key, boolean defValue) {
        throw new UnsupportedOperationException("stub");
    }

    public float getFloat(String key, float defValue) {
        throw new UnsupportedOperationException("stub");
    }

    public String getString(String key, String defValue) {
        throw new UnsupportedOperationException("stub");
    }
}
