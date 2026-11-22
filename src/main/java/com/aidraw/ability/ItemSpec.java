package com.aidraw.ability;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The powers of a drawn item. Stored on the ItemStack as JSON, so it syncs to clients automatically. */
public record ItemSpec(List<Ability> use, List<Ability> hit, List<Passive> passive,
                       double cooldownSeconds, boolean consumable) {

    public record Ability(AbilityType type, int strength, String effectId, String entityId) {}
    public record Passive(String effectId, int amplifier) {}

    public static final ItemSpec EMPTY = new ItemSpec(List.of(), List.of(), List.of(), 1, false);
    private static final Gson GSON = new Gson();
    private static final Map<String, ItemSpec> CACHE = new LinkedHashMap<>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, ItemSpec> e) { return size() > 256; }
    };

    public boolean flies() {
        return use.stream().anyMatch(a -> a.type == AbilityType.FLY);
    }

    public int flySpeed() {
        return use.stream().filter(a -> a.type == AbilityType.FLY).mapToInt(Ability::strength).max().orElse(0);
    }

    /** Effective right-click cooldown: never below what the abilities require. */
    public int cooldownTicks() {
        double min = 0.25;
        for (Ability a : use) min = Math.max(min, a.type.minCooldown);
        return (int) Math.round(Math.min(120, Math.max(min, cooldownSeconds)) * 20);
    }

    // ---------- (de)serialization ----------

    public String toJson() {
        JsonObject o = new JsonObject();
        o.add("use", abilities(use));
        o.add("hit", abilities(hit));
        JsonArray p = new JsonArray();
        for (Passive x : passive) {
            JsonObject j = new JsonObject();
            j.addProperty("effect_id", x.effectId);
            j.addProperty("amplifier", x.amplifier);
            p.add(j);
        }
        o.add("passive", p);
        o.addProperty("cooldown_seconds", cooldownSeconds);
        o.addProperty("consumable", consumable);
        return GSON.toJson(o);
    }

    private static JsonArray abilities(List<Ability> list) {
        JsonArray arr = new JsonArray();
        for (Ability a : list) {
            JsonObject j = new JsonObject();
            j.addProperty("type", a.type.name());
            j.addProperty("strength", a.strength);
            j.addProperty("effect_id", a.effectId);
            j.addProperty("entity_id", a.entityId);
            arr.add(j);
        }
        return arr;
    }

    public static ItemSpec fromJson(String json) {
        if (json == null || json.isEmpty()) return EMPTY;
        synchronized (CACHE) {
            ItemSpec cached = CACHE.get(json);
            if (cached != null) return cached;
        }
        ItemSpec spec;
        try {
            spec = fromJsonObject(JsonParser.parseString(json).getAsJsonObject(), 10);
        } catch (Exception e) {
            spec = EMPTY;
        }
        synchronized (CACHE) { CACHE.put(json, spec); }
        return spec;
    }

    /** Lenient parse + validation of untrusted JSON (Claude's answer or stack data). */
    public static ItemSpec fromJsonObject(JsonObject o, int maxStrength) {
        List<Ability> use = parseAbilities(o.get("use"), maxStrength, 6);
        List<Ability> hit = parseAbilities(o.get("hit"), maxStrength, 6);
        hit.removeIf(a -> a.type == AbilityType.FLY);
        List<Passive> passive = new ArrayList<>();
        if (o.has("passive") && o.get("passive").isJsonArray()) {
            for (JsonElement e : o.getAsJsonArray("passive")) {
                if (passive.size() >= 5 || !e.isJsonObject()) continue;
                JsonObject j = e.getAsJsonObject();
                String id = str(j, "effect_id");
                if (id.isEmpty()) continue;
                passive.add(new Passive(id, clamp(num(j, "amplifier", 0), 0, 4)));
            }
        }
        double cd = o.has("cooldown_seconds") ? o.get("cooldown_seconds").getAsDouble() : 1;
        boolean consumable = o.has("consumable") && o.get("consumable").getAsBoolean();
        return new ItemSpec(List.copyOf(use), List.copyOf(hit), List.copyOf(passive), cd, consumable);
    }

    private static List<Ability> parseAbilities(JsonElement el, int maxStrength, int limit) {
        List<Ability> out = new ArrayList<>();
        if (el == null || !el.isJsonArray()) return out;
        for (JsonElement e : el.getAsJsonArray()) {
            if (out.size() >= limit || !e.isJsonObject()) continue;
            JsonObject j = e.getAsJsonObject();
            AbilityType type;
            try { type = AbilityType.valueOf(str(j, "type")); } catch (Exception ex) { continue; }
            out.add(new Ability(type, clamp(num(j, "strength", 5), 1, Math.max(1, maxStrength)), str(j, "effect_id"), str(j, "entity_id")));
        }
        return out;
    }

    private static String str(JsonObject j, String k) {
        if (!j.has(k) || !j.get(k).isJsonPrimitive()) return "";
        String v = j.get(k).getAsString().trim();
        return k.equals("type") ? v.toUpperCase(java.util.Locale.ROOT) : v.toLowerCase(java.util.Locale.ROOT);
    }

    private static int num(JsonObject j, String k, int def) {
        try { return j.has(k) ? j.get(k).getAsInt() : def; } catch (Exception e) { return def; }
    }

    private static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }
}
