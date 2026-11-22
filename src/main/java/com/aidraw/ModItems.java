package com.aidraw;

import com.aidraw.item.*;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ToolMaterial;

import java.util.function.Function;

public final class ModItems {
    public static Item PAINTING_BOARD, DRAWN_GUN, DRAWN_PLANE, DRAWN_SWORD, DRAWN_TOOL,
            DRAWN_BOMB, DRAWN_WAND, DRAWN_FOOD, DRAWN_CHARM;

    private static Item reg(String name, Function<Item.Properties, Item> factory, Item.Properties props) {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath(AiDrawMod.MOD_ID, name));
        Item item = factory.apply(props.setId(key));
        return Registry.register(BuiltInRegistries.ITEM, key, item);
    }

    public static void register() {
        PAINTING_BOARD = reg("painting_board", PaintingBoardItem::new, new Item.Properties().stacksTo(1));
        DRAWN_GUN = reg("drawn_gun", DrawnItem::new, new Item.Properties().stacksTo(1).rarity(Rarity.RARE));
        DRAWN_PLANE = reg("drawn_plane", DrawnItem::new, new Item.Properties().stacksTo(1).rarity(Rarity.RARE));
        DRAWN_SWORD = reg("drawn_sword", DrawnItem::new, new Item.Properties().sword(ToolMaterial.NETHERITE, 3.0F, -2.4F).rarity(Rarity.RARE));
        DRAWN_TOOL = reg("drawn_tool", DrawnItem::new, new Item.Properties().pickaxe(ToolMaterial.NETHERITE, 1.0F, -2.8F).rarity(Rarity.RARE));
        DRAWN_BOMB = reg("drawn_bomb", DrawnItem::new, new Item.Properties().stacksTo(16).rarity(Rarity.EPIC));
        DRAWN_WAND = reg("drawn_wand", DrawnItem::new, new Item.Properties().stacksTo(1).rarity(Rarity.EPIC));
        DRAWN_FOOD = reg("drawn_food", DrawnItem::new, new Item.Properties().food(new FoodProperties(6, 0.6F, false)));
        DRAWN_CHARM = reg("drawn_charm", DrawnItem::new, new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON));

        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(e -> e.accept(PAINTING_BOARD));
    }

    private ModItems() {}
}
