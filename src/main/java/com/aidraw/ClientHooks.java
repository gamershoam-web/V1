package com.aidraw;

/** Bridge so common code can open client-only screens without referencing client classes. */
public final class ClientHooks {
    public static Runnable openDrawingScreen = () -> {};
    private ClientHooks() {}
}
