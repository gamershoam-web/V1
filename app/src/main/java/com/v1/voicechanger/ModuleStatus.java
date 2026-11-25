package com.v1.voicechanger;

/** The LSPosed hook replaces this method's result with true when the module is loaded into our own process. */
public final class ModuleStatus {
    private ModuleStatus() {
    }

    public static boolean isHookedIntoSelf() {
        return false;
    }
}
