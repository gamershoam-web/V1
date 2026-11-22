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
import java.util.concurrent.CompletableFuture;

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

    public static CompletableFuture<DrawingResult> classify(byte[] pixels, String hint) {
        AiConfig cfg = AiConfig.get();
        String png;
        try {
            png = ClaudeClient.toPngBase64(pixels);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
        String model = cfg.geminiModel == null || cfg.geminiModel.isBlank() ? "gemini-flash-latest" : cfg.geminiModel.trim();
        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + URLEncoder.encode(model, StandardCharsets.UTF_8) + ":generateContent";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(90))
                .header("content-type", "application/json")
                .header("x-goog-api-key", cfg.key())
                .POST(HttpRequest.BodyPublishers.ofString(buildBody(png, hint).toString()))
                .build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).thenApply(GeminiClient::parse);
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

    static DrawingResult parse(HttpResponse<String> resp) {
        return parseBody(resp.statusCode(), resp.body());
    }

    static DrawingResult parseBody(int status, String body) {
        if (status != 200) {
            AiDrawMod.LOGGER.error("Gemini API error {}: {}", status, body);
            String msg = switch (status) {
                case 400 -> body.contains("API_KEY_INVALID") ? "Invalid Gemini key (set it again with /aidraw key)" : "Gemini rejected the request";
                case 403 -> "Gemini key not allowed (is the Generative Language API enabled?)";
                case 404 -> "Gemini model not found (change geminiModel in config/aidraw.json)";
                case 429 -> "Free Gemini limit reached, try again in a minute";
                case 500, 503 -> "Gemini is busy, try again soon";
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
