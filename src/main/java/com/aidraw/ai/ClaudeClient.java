package com.aidraw.ai;

import com.aidraw.AiDrawMod;
import com.aidraw.Palette;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.CompletableFuture;

/** Sends the drawing to the Claude Messages API and gets back a structured classification. */
public final class ClaudeClient {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
    private static final String URL = "https://api.anthropic.com/v1/messages";

    private static final String SYSTEM = """
            You are the magic inside a Minecraft "Painting Board". A player drew a picture on a 32x32 pixel canvas \
            (shown enlarged). Decide what it depicts and turn it into the best in-game item. Be generous and creative: \
            kids' doodles are rough, so guess the most likely intent. The player's hint, if given, is very important.

            Pick exactly one category:
            - GUN: any gun, blaster, cannon, bow-like shooter. Shoots bullets.
            - PLANE: plane, jet, rocket, helicopter, wings, broom, any flying vehicle. Lets the player fly.
            - SWORD: sword, knife, axe used as a weapon, spear, any melee weapon.
            - TOOL: pickaxe, shovel, drill, hammer, any mining tool.
            - BOMB: bomb, dynamite, grenade, missile, explosive.
            - WAND: wand, staff, lightning, magic stick, thunder.
            - FOOD: any food or drink not in vanilla Minecraft (pizza, burger, ice cream, soda...).
            - EFFECT: things that give a power: shoes/boots (minecraft:speed), heart (minecraft:regeneration), \
            shield (minecraft:resistance), fire (minecraft:fire_resistance), fish/bubbles (minecraft:water_breathing), \
            eye/glasses (minecraft:night_vision), spring/frog (minecraft:jump_boost), muscle (minecraft:strength), \
            feather/balloon (minecraft:slow_falling), ghost (minecraft:invisibility), pickaxe-hand (minecraft:haste), clover (minecraft:luck).
            - MOB: an animal or creature that exists in Minecraft (pig, cow, cat, wolf, horse, creeper, zombie, villager, axolotl...). \
            Put its id in mob_id, e.g. "minecraft:pig".
            - VANILLA_ITEM: something that already exists as a Minecraft item or block (apple, diamond, house->oak_planks, tree->oak_sapling, \
            boat, bucket, torch, bed, cake, armor, shield, bow, trident, boat, minecart...). Put its exact id in vanilla_id, \
            e.g. "minecraft:diamond_chestplate", and a sensible count (1 for tools/armor, up to 16 for materials).
            - OTHER: none of the above fits. It becomes a decorative charm; still pick a fitting effect_id.

            Rules: prefer GUN/PLANE/SWORD/TOOL/BOMB/WAND/FOOD over VANILLA_ITEM when the drawing is clearly that kind of thing \
            and not a vanilla item. power is 1-5: how detailed/impressive the drawing is (more effort = stronger). \
            name: a fun short item name (max 30 chars) like "Blue Laser Blaster". description: one short sentence (max 60 chars). \
            Unused id fields must be empty strings; unused count = 1. Ids must be lowercase namespaced Minecraft ids.""";

    private static final String[] CATEGORIES = {"GUN", "PLANE", "SWORD", "TOOL", "BOMB", "WAND", "FOOD", "EFFECT", "MOB", "VANILLA_ITEM", "OTHER"};

    public static CompletableFuture<DrawingResult> classify(byte[] pixels, String hint) {
        AiConfig cfg = AiConfig.get();
        String png;
        try {
            png = toPngBase64(pixels);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
        return send(buildBody(cfg, png, hint, true), cfg.key())
                .thenCompose(resp -> {
                    // If server-side fallbacks are not available for this key, retry once without them.
                    if (resp.statusCode() == 400 && resp.body().contains("fallback")) {
                        return send(buildBody(cfg, png, hint, false), cfg.key());
                    }
                    return CompletableFuture.completedFuture(resp);
                })
                .thenApply(ClaudeClient::parse);
    }

    private static CompletableFuture<HttpResponse<String>> send(JsonObject body, String key) {
        HttpRequest req = HttpRequest.newBuilder(URI.create(URL))
                .timeout(Duration.ofSeconds(120))
                .header("content-type", "application/json")
                .header("x-api-key", key)
                .header("anthropic-version", "2026-10-21")
                .header("anthropic-beta", "server-side-fallback-2026-07-01")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString());
    }

    static JsonObject buildBody(AiConfig cfg, String pngBase64, String hint, boolean withFallbacks) {
        JsonObject body = new JsonObject();
        body.addProperty("model", cfg.model);
        body.addProperty("max_tokens", 8000);
        body.addProperty("system", SYSTEM);
        if (withFallbacks) body.addProperty("fallbacks", "default");

        JsonObject outputConfig = new JsonObject();
        outputConfig.addProperty("effort", cfg.effort);
        JsonObject format = new JsonObject();
        format.addProperty("type", "json_schema");
        format.add("schema", schema());
        outputConfig.add("format", format);
        body.add("output_config", outputConfig);

        JsonObject image = new JsonObject();
        image.addProperty("type", "image");
        JsonObject source = new JsonObject();
        source.addProperty("type", "base64");
        source.addProperty("media_type", "image/png");
        source.addProperty("data", pngBase64);
        image.add("source", source);

        JsonObject text = new JsonObject();
        text.addProperty("type", "text");
        String h = hint == null ? "" : hint.strip();
        text.addProperty("text", h.isEmpty() ? "Here is my drawing. What is it?" : "Here is my drawing. Player's hint: \"" + h + "\"");

        JsonArray content = new JsonArray();
        content.add(image);
        content.add(text);
        JsonObject msg = new JsonObject();
        msg.addProperty("role", "user");
        msg.add("content", content);
        JsonArray messages = new JsonArray();
        messages.add(msg);
        body.add("messages", messages);
        return body;
    }

    private static JsonObject schema() {
        JsonObject props = new JsonObject();
        JsonObject cat = str();
        JsonArray en = new JsonArray();
        for (String c : CATEGORIES) en.add(c);
        cat.add("enum", en);
        props.add("category", cat);
        props.add("name", str());
        props.add("description", str());
        props.add("power", type("integer"));
        props.add("vanilla_id", str());
        props.add("count", type("integer"));
        props.add("effect_id", str());
        props.add("mob_id", str());
        JsonArray required = new JsonArray();
        for (String k : props.keySet()) required.add(k);
        JsonObject s = type("object");
        s.add("properties", props);
        s.add("required", required);
        s.addProperty("additionalProperties", false);
        return s;
    }

    private static JsonObject str() { return type("string"); }

    private static JsonObject type(String t) {
        JsonObject o = new JsonObject();
        o.addProperty("type", t);
        return o;
    }

    private static DrawingResult parse(HttpResponse<String> resp) {
        if (resp.statusCode() != 200) {
            AiDrawMod.LOGGER.error("Claude API error {}: {}", resp.statusCode(), resp.body());
            String msg = switch (resp.statusCode()) {
                case 401 -> "Invalid API key (check config/aidraw.json)";
                case 429 -> "Rate limited, try again in a moment";
                case 529, 503 -> "Claude is overloaded, try again soon";
                default -> "API error " + resp.statusCode();
            };
            throw new RuntimeException(msg);
        }
        JsonObject root = JsonParser.parseString(resp.body()).getAsJsonObject();
        String stop = root.has("stop_reason") && !root.get("stop_reason").isJsonNull() ? root.get("stop_reason").getAsString() : "";
        if ("refusal".equals(stop)) throw new RuntimeException("Claude refused to turn that drawing into an item");
        if ("max_tokens".equals(stop)) throw new RuntimeException("AI response was cut off, try again");
        for (var el : root.getAsJsonArray("content")) {
            JsonObject block = el.getAsJsonObject();
            if (!"text".equals(block.get("type").getAsString())) continue; // skip thinking blocks
            JsonObject j = JsonParser.parseString(block.get("text").getAsString()).getAsJsonObject();
            return new DrawingResult(
                    j.get("category").getAsString(),
                    j.get("name").getAsString(),
                    j.get("description").getAsString(),
                    j.get("power").getAsInt(),
                    j.get("vanilla_id").getAsString(),
                    j.get("count").getAsInt(),
                    j.get("effect_id").getAsString(),
                    j.get("mob_id").getAsString());
        }
        throw new RuntimeException("AI gave no answer");
    }

    /** Renders palette indices to a 256x256 PNG (8x nearest-neighbour upscale) for better vision. */
    static String toPngBase64(byte[] pixels) throws Exception {
        int n = Palette.SIZE, scale = 8;
        BufferedImage img = new BufferedImage(n * scale, n * scale, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++) {
                int idx = pixels[y * n + x] & 0xFF;
                int rgb = Palette.RGB[idx < Palette.RGB.length ? idx : 0];
                for (int dy = 0; dy < scale; dy++)
                    for (int dx = 0; dx < scale; dx++)
                        img.setRGB(x * scale + dx, y * scale + dy, rgb);
            }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }

    private ClaudeClient() {}
}
