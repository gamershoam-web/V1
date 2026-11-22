package com.aidraw.ai;

import java.util.concurrent.CompletableFuture;

/** Picks the AI from the key's format: Gemini keys start with "AIza", Anthropic keys with "sk-ant-". */
public final class AiRouter {
    public enum Provider { NONE, GEMINI, CLAUDE }

    public static Provider provider() {
        String k = AiConfig.get().key();
        if (k.isEmpty()) return Provider.NONE;
        return k.startsWith("sk-ant-") ? Provider.CLAUDE : Provider.GEMINI;
    }

    public static String name() {
        return switch (provider()) { case CLAUDE -> "Claude"; case GEMINI -> "Gemini"; case NONE -> "Offline"; };
    }

    public static CompletableFuture<DrawingResult> classify(byte[] pixels, String hint) {
        return provider() == Provider.CLAUDE ? ClaudeClient.classify(pixels, hint) : GeminiClient.classify(pixels, hint);
    }

    private AiRouter() {}
}
