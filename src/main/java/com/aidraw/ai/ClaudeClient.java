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

    static final String SYSTEM = """
            You are the magic inside a Minecraft "Painting Board". A player drew a picture on a 32x32 pixel canvas \
            (shown enlarged), optionally with a hint. Work out what it is (doodles are rough: guess the most likely intent; \
            the hint is very important) and DESIGN a Minecraft item whose powers really match it. Be faithful and dramatic: \
            an atom bomb must be a real nuke, a "crazy" or "ultimate" sword must have crazy powers, a fighter jet flies AND shoots.

            category = what it looks like in game:
            GUN, PLANE (any flying thing: jet, rocket, wings, broom, carpet), SWORD (any melee weapon), TOOL (pickaxe, drill, hammer), \
            BOMB (any explosive), WAND (staffs, magic, orbs, gauntlets), FOOD (non-vanilla food/drink), CHARM (anything else: \
            shoes, rings, hearts, crowns, armor pieces with powers, gadgets, creatures you want as a power), \
            MOB (the drawing is just a Minecraft animal/mob: set mob_id, e.g. "minecraft:wolf"; no abilities needed), \
            VANILLA_ITEM (it's simply an existing Minecraft item/block with nothing special: set vanilla_id + count; no abilities needed).

            Powers. Each ability = {type, strength 1-10, effect_id, entity_id}.
            use_abilities run on right-click (at the block/mob the player looks at, up to 100 blocks), \
            hit_abilities run when hitting a mob in melee (at the victim). Combine several for complex items.
            - EXPLOSION: TNT-like blast at target (10 = huge). NUKE: nuclear bomb, carves a crater, mushroom cloud \
            (strength 10 = city-destroying atom bomb; 5 = mini-nuke). LIGHTNING: strength = number of bolts. FIRE: firestorm. \
            SHOOT_ARROW: bullets (strength = damage & count; for guns). SHOOT_FIREBALL: ghast fireballs. BEAM: laser that pierces mobs. \
            METEOR_SHOWER: fireballs rain from the sky. SHOCKWAVE: blasts all nearby mobs away from the player. \
            DASH: launch forward. LAUNCH_UP: super jump. TELEPORT: blink to where you look. FLY: hold right-click to fly \
            (strength = speed; other use_abilities also fire while flying). FREEZE: freezes mobs, water to ice. \
            BLACK_HOLE: sucks in and crushes mobs. SUMMON: spawns entity_id allies (e.g. "minecraft:wolf", "minecraft:iron_golem"); \
            tamable ones become pets. HEAL: heal yourself. EFFECT_SELF: give yourself effect_id. \
            EFFECT_AREA: give effect_id to mobs around target (e.g. "minecraft:poison", "minecraft:wither", "minecraft:levitation"). \
            KNOCKBACK (hit only: send victim flying). LIFESTEAL (hit only: heal on hit).
            passive_effects: effects the player gets while holding it ({effect_id, amplifier 0-4}), e.g. speed, strength, \
            resistance, regeneration, fire_resistance, night_vision, jump_boost, haste, slow_falling, water_breathing, invisibility. \
            For FOOD, passive_effects are given when eaten and use_abilities trigger when eaten.

            Other fields: attack_damage = melee damage (swords 8-30 depending on how epic; 0 = default). cooldown_seconds between \
            right-clicks (0.25 for rapid guns, longer for big powers). consumable = true if it should be used up (bombs, grenades, \
            potions); count = how many you get (1 for unique items, 3-8 grenades, 1-16 vanilla materials). \
            name: fun short name (max 30 chars). description: one short sentence (max 60 chars). \
            Strength guide: match the concept's real-world scale first (nuke = 10), then add +1/+2 for detailed, effortful drawings. \
            Unused string fields = "", unused arrays = []. All ids are lowercase namespaced Minecraft ids.

            Examples: atom bomb -> BOMB, use [NUKE 10], consumable, count 1, cooldown 30. \
            crazy flaming sword -> SWORD, attack_damage 20, hit [FIRE 7, LIGHTNING 3, KNOCKBACK 5], use [SHOCKWAVE 7, DASH 6], \
            passive [strength 1, fire_resistance 0]. fighter jet -> PLANE, use [FLY 8, SHOOT_ARROW 6]. \
            laser gun -> GUN, use [BEAM 7], cooldown 0.5. thor hammer -> SWORD, hit [LIGHTNING 4], use [LIGHTNING 8, LAUNCH_UP 5].""";

    private static final String[] CATEGORIES = {"GUN", "PLANE", "SWORD", "TOOL", "BOMB", "WAND", "FOOD", "CHARM", "MOB", "VANILLA_ITEM"};

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
        body.addProperty("max_tokens", 16000);
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
        props.add("category", enumOf(CATEGORIES));
        props.add("name", str());
        props.add("description", str());
        props.add("vanilla_id", str());
        props.add("mob_id", str());
        props.add("count", type("integer"));
        props.add("attack_damage", type("integer"));
        props.add("cooldown_seconds", type("number"));
        props.add("consumable", type("boolean"));

        String[] abilityNames = java.util.Arrays.stream(com.aidraw.ability.AbilityType.values()).map(Enum::name).toArray(String[]::new);
        JsonObject abilityProps = new JsonObject();
        abilityProps.add("type", enumOf(abilityNames));
        abilityProps.add("strength", type("integer"));
        abilityProps.add("effect_id", str());
        abilityProps.add("entity_id", str());
        props.add("use_abilities", arrayOf(object(abilityProps)));
        props.add("hit_abilities", arrayOf(object(abilityProps)));

        JsonObject passiveProps = new JsonObject();
        passiveProps.add("effect_id", str());
        passiveProps.add("amplifier", type("integer"));
        props.add("passive_effects", arrayOf(object(passiveProps)));
        return object(props);
    }

    private static JsonObject object(JsonObject props) {
        JsonArray required = new JsonArray();
        for (String k : props.keySet()) required.add(k);
        JsonObject s = type("object");
        s.add("properties", props);
        s.add("required", required);
        s.addProperty("additionalProperties", false);
        return s;
    }

    private static JsonObject arrayOf(JsonObject items) {
        JsonObject a = type("array");
        a.add("items", items);
        return a;
    }

    private static JsonObject enumOf(String[] values) {
        JsonObject o = str();
        JsonArray en = new JsonArray();
        for (String v : values) en.add(v);
        o.add("enum", en);
        return o;
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
            return toResult(JsonParser.parseString(block.get("text").getAsString()).getAsJsonObject());
        }
        throw new RuntimeException("AI gave no answer");
    }

    /** Builds a result from the item-design JSON (same shape for every AI provider). */
    static DrawingResult toResult(JsonObject j) {
        return new DrawingResult(
                getStr(j, "category"), getStr(j, "name"), getStr(j, "description"),
                getStr(j, "vanilla_id"), getStr(j, "mob_id"),
                getInt(j, "count", 1), getInt(j, "attack_damage", 0), j);
    }

    private static String getStr(JsonObject j, String k) {
        return j.has(k) && j.get(k).isJsonPrimitive() ? j.get(k).getAsString() : "";
    }

    private static int getInt(JsonObject j, String k, int def) {
        try { return j.has(k) ? j.get(k).getAsInt() : def; } catch (Exception e) { return def; }
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
