package com.aidraw;

import com.aidraw.ai.AiConfig;
import com.aidraw.ai.ClaudeClientTestAccess;
import com.aidraw.item.ItemFactoryTestAccess;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.crafting.Recipe;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ModTest {
    @BeforeAll
    static void boot() {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        ModItems.register();
    }

    @Test
    void itemsRegistered() {
        for (String n : new String[]{"painting_board", "drawn_gun", "drawn_plane", "drawn_sword", "drawn_tool", "drawn_bomb", "drawn_wand", "drawn_food", "drawn_charm"}) {
            var id = net.minecraft.resources.Identifier.fromNamespaceAndPath("aidraw", n);
            assertTrue(BuiltInRegistries.ITEM.containsKey(id), n);
            assertTrue(Files.exists(Path.of("src/main/resources/assets/aidraw/items/" + n + ".json")), n + " item def");
            assertTrue(Files.exists(Path.of("src/main/resources/assets/aidraw/textures/item/" + n + ".png")), n + " texture");
        }
    }

    @Test
    void recipeParses() throws Exception {
        String raw = Files.readString(Path.of("src/main/resources/data/aidraw/recipe/painting_board.json"));
        assertTrue(raw.contains("\"#minecraft:wool\""));
        // tags are not loaded in unit tests, so validate structure with a concrete wool item
        JsonObject json = JsonParser.parseString(raw.replace("#minecraft:wool", "minecraft:white_wool")).getAsJsonObject();
        var ops = RegistryOps.create(JsonOps.INSTANCE, RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY));
        var result = Recipe.CODEC.parse(ops, json);
        assertTrue(result.isSuccess(), () -> result.error().get().message());
        System.out.println("Recipe OK: " + result.getOrThrow().getClass().getSimpleName());
    }

    @Test
    void requestBodyAndImage() throws Exception {
        byte[] px = new byte[Palette.SIZE * Palette.SIZE];
        px[5] = 4;
        String png = ClaudeClientTestAccess.png(px);
        assertTrue(png.length() > 100);
        JsonObject body = ClaudeClientTestAccess.body(AiConfig.get(), png, "gun", true);
        assertEquals("claude-opus-5-5", body.get("model").getAsString());
        assertTrue(body.toString().contains("\"NUKE\""));
        assertEquals("json_schema", body.getAsJsonObject("output_config").getAsJsonObject("format").get("type").getAsString());
        System.out.println(body.toString().replace(png, "<png>"));
    }

    @Test
    void vanillaMapping() {
        var diamond = ItemFactoryTestAccess.vanilla("minecraft:diamond", 99);
        assertTrue(diamond.isPresent());
        assertEquals(16, diamond.get().stack().getCount());
        assertTrue(ItemFactoryTestAccess.vanilla("minecraft:command_block", 1).isEmpty());
        assertTrue(ItemFactoryTestAccess.vanilla("minecraft:not_real", 1).isEmpty());
        assertEquals("minecraft:speed", ItemFactoryTestAccess.effect("minecraft:speed"));
        assertNull(ItemFactoryTestAccess.effect("bogus"));
    }

    private static com.aidraw.ai.DrawingResult result(String json) {
        JsonObject j = JsonParser.parseString(json).getAsJsonObject();
        return new com.aidraw.ai.DrawingResult(j.get("category").getAsString(), j.get("name").getAsString(), j.get("description").getAsString(),
                "", "", j.get("count").getAsInt(), j.get("attack_damage").getAsInt(), j);
    }

    @Test
    void atomBomb() {
        var r = result("""
                {"category":"BOMB","name":"Tsar Bomba","description":"It ends worlds.","vanilla_id":"","mob_id":"","count":1,
                 "attack_damage":0,"cooldown_seconds":30,"consumable":true,
                 "use_abilities":[{"type":"NUKE","strength":10,"effect_id":"","entity_id":""}],"hit_abilities":[],"passive_effects":[]}""");
        var spec = com.aidraw.item.ItemFactory.buildSpec(r.raw());
        assertEquals(com.aidraw.ability.AbilityType.NUKE, spec.use().get(0).type());
        assertEquals(10, spec.use().get(0).strength());
        assertTrue(spec.consumable());
        assertEquals(600, spec.cooldownTicks());
        var stack = com.aidraw.item.ItemFactory.build(ModItems.DRAWN_BOMB, spec, r.name(), r.description(), 1, 0, AiConfig.get());
        assertEquals(spec, com.aidraw.item.DrawnItem.spec(stack)); // round-trips through the stack
        String lore = stack.get(net.minecraft.core.component.DataComponents.LORE).lines().toString();
        assertTrue(lore.contains("Nuclear blast Lv 10"), lore);
        int radius = Math.max(8, (int) Math.round(AiConfig.get().maxNukeRadius * 10 / 10.0));
        assertEquals(40, radius);
    }

    @Test
    void crazySword() {
        var r = result("""
                {"category":"SWORD","name":"Chaos Blade","description":"Crackles with madness.","vanilla_id":"","mob_id":"","count":5,
                 "attack_damage":99,"cooldown_seconds":0,"consumable":true,
                 "use_abilities":[{"type":"SHOCKWAVE","strength":8,"effect_id":"","entity_id":""},{"type":"dash","strength":50,"effect_id":"","entity_id":""},{"type":"NOT_REAL","strength":3,"effect_id":"","entity_id":""}],
                 "hit_abilities":[{"type":"LIGHTNING","strength":4,"effect_id":"","entity_id":""},{"type":"FLY","strength":4,"effect_id":"","entity_id":""}],
                 "passive_effects":[{"effect_id":"minecraft:strength","amplifier":9},{"effect_id":"minecraft:bogus","amplifier":1}]}""");
        var spec = com.aidraw.item.ItemFactory.buildSpec(r.raw());
        assertEquals(2, spec.use().size());                 // unknown ability dropped
        assertEquals(10, spec.use().get(1).strength());     // clamped, case-insensitive
        assertEquals(1, spec.hit().size());                 // FLY not allowed on hit
        assertEquals(1, spec.passive().size());             // bogus effect dropped
        assertEquals(4, spec.passive().get(0).amplifier()); // clamped
        assertEquals(40, spec.cooldownTicks());             // shockwave min cooldown 2s
        var stack = com.aidraw.item.ItemFactory.build(ModItems.DRAWN_SWORD, spec, r.name(), r.description(), 5, 99, AiConfig.get());
        assertEquals(1, stack.getCount());                  // swords never stack
        assertFalse(com.aidraw.item.DrawnItem.spec(stack).consumable()); // swords are never single-use
        var mods = stack.get(net.minecraft.core.component.DataComponents.ATTRIBUTE_MODIFIERS);
        assertTrue(mods.toString().contains("29"), mods.toString()); // 30 dmg cap (1 base + 29)
        System.out.println(stack.get(net.minecraft.core.component.DataComponents.LORE).lines());
    }
}
