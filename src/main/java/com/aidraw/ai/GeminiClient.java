package com.aidraw.ai;

import com.aidraw.AiDrawMod;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Google Gemini (free tier, key from aistudio.google.com) as the drawing AI.
 * Uses the same design prompt as the Claude client and returns the same JSON shape.
 */
public final class GeminiClient {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    /** Exact JSON shape we want back (Gemini gets it in the prompt; the answer is validated afterwards anyway). */
    static final String FORMAT = """

            Answer with ONE JSON object only, no markdown, exactly these keys:
            {"category": one of GUN|PLANE|SWORD|TOOL|BOMB|WAND|FOOD|CHARM|MOB|VANILLA_ITEM,
             "name": string, "description": string, "vanilla_id": string, "mob_id": string,
             "count": integer, "attack_damage": integer, "cooldown_seconds": number, "consumable": boolean,
             "use_abilities": [{"type": ABILITY, "strength": integer 1-10, "effect_id": string, "entity_id": string}],
             "hit_abilities": [same shape as use_abilities],
             "passive_effects": [{"effect_id": string, "amplifier": integer 0-4}]}
            ABILITY is one of: EXPLOSION, NUKE, LIGHTNING, FIRE, SHOOT_ARROW, SHOOT_FIREBALL, BEAM, METEOR_SHOWER, SHOCKWAVE, \
            DASH, LAUNCH_UP, TELEPORT, FLY, FREEZE, BLACK_HOLE, SUMMON, HEAL, EFFECT_SELF, EFFECT_AREA, KNOCKBACK, LIFESTEAL.""";

    /** Tried in order when a model is overloaded, rate-limited or retired. The configured model goes first. */
    /** Fast free models: their "busy" spikes pass within seconds, so they are retried after short pauses. */
    private static final String[] FAST_MODELS = {"gemini-flash-lite-latest", "gemini-3.5-flash-lite"};
    /** Bigger free models: often overloaded and can hang, so they are only the last resort. */
    private static final String[] SLOW_MODELS = {"gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash"};
    private static final String WAIT = "wait:";
    /** Models that hang, hit their rate limit or are retired are skipped for a while. */
    private static final Map<String, Long> BENCHED_UNTIL = new ConcurrentHashMap<>();

    public static CompletableFuture<DrawingResult> classify(byte[] pixels, String hint) {
        AiConfig cfg = AiConfig.get();
        String png;
        try {
            png = ClaudeClient.toPngBase64(pixels);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
        return attempt(plan(cfg), 0, buildBody(png, hint).toString(), cfg.key(), null);
    }

    /** e.g. [lite, lite2, wait:2000, lite, lite2, wait:4000, lite, lite2, flash, flash-latest, 3.8-flash] */
    static List<String> plan(AiConfig cfg) {
        List<String> plan = new ArrayList<>();
        if (cfg.geminiModel != null && !cfg.geminiModel.isBlank()) plan.add(cfg.geminiModel.trim());
        int[] pauses = {0, 2000, 4000};
        for (int pause : pauses) {
            if (pause > 0) plan.add(WAIT + pause);
            plan.addAll(List.of(FAST_MODELS));
        }
        plan.addAll(List.of(SLOW_MODELS));
        return plan;
    }

    private static CompletableFuture<DrawingResult> attempt(List<String> plan, int i, String body, String key, RuntimeException last) {
        if (i >= plan.size()) {
            return CompletableFuture.failedFuture(last != null ? last : new RuntimeException("Gemini is very busy right now, try again soon"));
        }
        String step = plan.get(i);
        if (step.startsWith(WAIT)) {
            long ms = Long.parseLong(step.substring(WAIT.length()));
            return CompletableFuture.supplyAsync(() -> null, CompletableFuture.delayedExecutor(ms, TimeUnit.MILLISECONDS))
                    .thenCompose(x -> attempt(plan, i + 1, body, key, last));
        }
        if (BENCHED_UNTIL.getOrDefault(step, 0L) > System.currentTimeMillis()) {
            return attempt(plan, i + 1, body, key, last);
        }
        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + URLEncoder.encode(step, StandardCharsets.UTF_8) + ":generateContent";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                // Overloaded models can hang for a minute before saying so; don't make the player wait that long.
                .timeout(Duration.ofSeconds(20))
                .header("content-type", "application/json")
                .header("x-goog-api-key", key)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).handle((resp, err) -> {
            if (err != null) {
                AiDrawMod.LOGGER.warn("Gemini model {} did not answer: {}", step, err.toString());
                BENCHED_UNTIL.put(step, System.currentTimeMillis() + 5 * 60_000);
                return attempt(plan, i + 1, body, key, new RuntimeException("Gemini didn't answer in time"));
            }
            int status = resp.statusCode();
            if (status == 404 || status == 429 || status == 500 || status == 503) {
                AiDrawMod.LOGGER.warn("Gemini model {} unavailable ({}), trying the next one", step, status);
                if (status == 404) BENCHED_UNTIL.put(step, System.currentTimeMillis() + 24L * 3600_000); // retired
                if (status == 429) BENCHED_UNTIL.put(step, System.currentTimeMillis() + 60_000);        // rate limit
                RuntimeException e;
                try { parseBody(status, resp.body()); e = new RuntimeException("Gemini error " + status); }
                catch (RuntimeException ex) { e = ex; }
                return attempt(plan, i + 1, body, key, e);
            }
            try {
                return CompletableFuture.completedFuture(parseBody(status, resp.body()));
            } catch (RuntimeException ex) {
                // A 200 with a broken/empty answer: another model will probably do better.
                if (status == 200) {
                    AiDrawMod.LOGGER.warn("Gemini model {} gave an unusable answer: {}", step, ex.getMessage());
                    return attempt(plan, i + 1, body, key, ex);
                }
                return CompletableFuture.<DrawingResult>failedFuture(ex);
            }
        }).thenCompose(f -> f);
    }

    static JsonObject buildBody(String pngBase64, String hint) {
        JsonObject body = new JsonObject();

        JsonObject sys = new JsonObject();
        sys.add("parts", parts(text(ClaudeClient.SYSTEM + FORMAT)));
        body.add("systemInstruction", sys);

        JsonObject image = new JsonObject();
        JsonObject inline = new JsonObject();
        inline.addProperty("mimeType", "image/png");
        inline.addProperty("data", pngBase64);
        image.add("inlineData", inline);

        String h = hint == null ? "" : hint.strip();
        JsonObject user = new JsonObject();
        user.addProperty("role", "user");
        user.add("parts", parts(image, text(h.isEmpty() ? "Here is my drawing. What is it?" : "Here is my drawing. Player's hint: \"" + h + "\"")));
        JsonArray contents = new JsonArray();
        contents.add(user);
        body.add("contents", contents);

        JsonObject gen = new JsonObject();
        gen.addProperty("responseMimeType", "application/json");
        gen.addProperty("maxOutputTokens", 8192);
        body.add("generationConfig", gen);
        return body;
    }

    private static JsonObject text(String t) {
        JsonObject o = new JsonObject();
        o.addProperty("text", t);
        return o;
    }

    private static JsonArray parts(JsonObject... ps) {
        JsonArray a = new JsonArray();
        for (JsonObject p : ps) a.add(p);
        return a;
    }

    static DrawingResult parseBody(int status, String body) {
        if (status != 200) {
            AiDrawMod.LOGGER.error("Gemini API error {}: {}", status, body);
            String msg = switch (status) {
                case 400 -> body.contains("API_KEY_INVALID") ? "Invalid Gemini key (set it again with /aidraw key)" : "Gemini rejected the request";
                case 403 -> "Gemini key not allowed (is the Generative Language API enabled?)";
                case 404 -> "Gemini model not found (change geminiModel in config/aidraw.json)";
                case 429 -> "Free Gemini limit reached, try again in a minute";
                case 500, 503 -> "Gemini is very busy right now, try again soon";
                default -> "Gemini error " + status;
            };
            throw new RuntimeException(msg);
        }
        JsonObject root = JsonParser.parseString(body).getAsJsonObject();
        JsonArray candidates = root.getAsJsonArray("candidates");
        if (candidates == null || candidates.isEmpty()) throw new RuntimeException("Gemini refused to answer");
        JsonObject content = candidates.get(0).getAsJsonObject().getAsJsonObject("content");
        if (content == null || !content.has("parts")) throw new RuntimeException("Gemini gave no answer");
        StringBuilder text = new StringBuilder();
        for (var p : content.getAsJsonArray("parts")) {
            JsonObject part = p.getAsJsonObject();
            if (part.has("thought") && part.get("thought").getAsBoolean()) continue; // skip thinking parts
            if (part.has("text")) text.append(part.get("text").getAsString());
        }
        return ClaudeClient.toResult(extractJson(text.toString()));
    }

    /** Tolerates ```json fences or extra words around the object. */
    static JsonObject extractJson(String s) {
        int start = s.indexOf('{'), end = s.lastIndexOf('}');
        if (start < 0 || end <= start) throw new RuntimeException("Gemini answer wasn't JSON");
        return JsonParser.parseString(s.substring(start, end + 1)).getAsJsonObject();
    }

    private GeminiClient() {}
}
