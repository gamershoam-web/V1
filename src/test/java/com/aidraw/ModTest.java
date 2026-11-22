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
        assertEquals("minecraft:luck", ItemFactoryTestAccess.effect("bogus"));
    }
}
