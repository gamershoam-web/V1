package com.aidraw.ai;

import com.google.gson.JsonObject;

public class ClaudeClientTestAccess {
    public static String png(byte[] p) throws Exception { return ClaudeClient.toPngBase64(p); }
    public static JsonObject body(AiConfig c, String png, String hint, boolean fb) { return ClaudeClient.buildBody(c, png, hint, fb); }
}
