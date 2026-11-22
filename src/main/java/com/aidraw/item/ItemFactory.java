package com.aidraw.item;

import com.aidraw.ModItems;
import com.aidraw.ai.AiConfig;
import com.aidraw.ai.DrawingResult;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.component.ItemLore;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/** Turns Claude's answer into a real ItemStack (or a spawned mob). */
public final class ItemFactory {
    public record Outcome(ItemStack stack, String label) {}

    private static final Set<String> BANNED_ITEMS = Set.of(
            "minecraft:command_block", "minecraft:chain_command_block", "minecraft:repeating_command_block",
            "minecraft:command_block_minecart", "minecraft:structure_block", "minecraft:structure_void",
            "minecraft:jigsaw", "minecraft:barrier", "minecraft:light", "minecraft:debug_stick",
            "minecraft:bedrock", "minecraft:end_portal_frame", "minecraft:knowledge_book", "minecraft:spawner",
            "minecraft:trial_spawner", "minecraft:vault", "minecraft:test_block", "minecraft:test_instance_block",
            "minecraft:reinforced_deepslate", "minecraft:air");
    private static final Set<String> BOSS_MOBS = Set.of("minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", "minecraft:elder_guardian");

    public static Outcome create(ServerPlayer player, DrawingResult r) {
        int power = Math.max(1, Math.min(5, r.power()));
        String name = clip(r.name(), 30, "Mystery Drawing");
        String desc = clip(r.description(), 60, "");
        AiConfig cfg = AiConfig.get();

        String category = r.category() == null ? "OTHER" : r.category();
        switch (category) {
            case "MOB" -> {
                Optional<Outcome> mob = mob(player, r.mobId(), cfg);
                if (mob.isPresent()) return mob.get();
            }
            case "VANILLA_ITEM" -> {
                if (cfg.allowVanillaItems) {
                    Optional<Outcome> v = vanilla(r.vanillaId(), r.count(), cfg);
                    if (v.isPresent()) return v.get();
                }
            }
            default -> {}
        }

        Item item = switch (category) {
            case "GUN" -> ModItems.DRAWN_GUN;
            case "PLANE" -> ModItems.DRAWN_PLANE;
            case "SWORD" -> ModItems.DRAWN_SWORD;
            case "TOOL" -> ModItems.DRAWN_TOOL;
            case "BOMB" -> ModItems.DRAWN_BOMB;
            case "WAND" -> ModItems.DRAWN_WAND;
            case "FOOD" -> ModItems.DRAWN_FOOD;
            default -> ModItems.DRAWN_CHARM; // EFFECT, OTHER, or a MOB/VANILLA id that didn't exist
        };

        ItemStack stack = new ItemStack(item, item == ModItems.DRAWN_BOMB ? Math.min(16, 1 + power) : 1);
        CompoundTag tag = new CompoundTag();
        tag.putInt("power", power);
        if (item == ModItems.DRAWN_CHARM) {
            tag.putString("effect", validEffect(r.effectId()));
        }
        stack.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        stack.set(DataComponents.CUSTOM_NAME, Component.literal(name).withStyle(ChatFormatting.AQUA));
        if (item == ModItems.DRAWN_FOOD) {
            stack.set(DataComponents.FOOD, new FoodProperties(2 + power * 2, 0.3F + power * 0.15F, false));
            stack.setCount(Math.min(64, power * 2));
        }

        List<Component> lore = new java.util.ArrayList<>();
        if (!desc.isEmpty()) lore.add(Component.literal(desc).withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        lore.add(Component.literal(hint(item)).withStyle(ChatFormatting.DARK_AQUA));
        lore.add(Component.literal("Power " + "★".repeat(power) + "☆".repeat(5 - power)).withStyle(ChatFormatting.GOLD));
        stack.set(DataComponents.LORE, new ItemLore(lore));
        return new Outcome(stack, name);
    }

    private static String hint(Item item) {
        if (item == ModItems.DRAWN_GUN) return "Right-click to shoot";
        if (item == ModItems.DRAWN_PLANE) return "Hold right-click to fly";
        if (item == ModItems.DRAWN_BOMB) return "Right-click to blow up where you look";
        if (item == ModItems.DRAWN_WAND) return "Right-click to call lightning";
        if (item == ModItems.DRAWN_FOOD) return "Tasty!";
        if (item == ModItems.DRAWN_CHARM) return "Right-click for a magic power";
        return "Drawn by hand";
    }

    private static Optional<Outcome> mob(ServerPlayer player, String mobId, AiConfig cfg) {
        Identifier id = Identifier.tryParse(mobId == null ? "" : mobId);
        if (id == null) return Optional.empty();
        if (!cfg.allowBossMobs && BOSS_MOBS.contains(id.toString())) return Optional.empty();
        Optional<EntityType<?>> type = BuiltInRegistries.ENTITY_TYPE.getOptional(id);
        if (type.isEmpty() || !type.get().canSummon()) return Optional.empty();

        // Prefer handing over a spawn egg, so the player decides where it goes.
        Identifier eggId = Identifier.fromNamespaceAndPath(id.getNamespace(), id.getPath() + "_spawn_egg");
        Optional<Item> egg = BuiltInRegistries.ITEM.getOptional(eggId);
        if (egg.isPresent() && egg.get() != Items.AIR) {
            return Optional.of(new Outcome(new ItemStack(egg.get()), "a " + pretty(id.getPath()) + " spawn egg"));
        }
        var entity = type.get().spawn(player.level(), player.blockPosition().relative(player.getDirection(), 2), EntitySpawnReason.SPAWN_ITEM_USE);
        if (entity == null) return Optional.empty();
        return Optional.of(new Outcome(ItemStack.EMPTY, "a real " + pretty(id.getPath()) + "!"));
    }

    static Optional<Outcome> vanilla(String itemId, int count, AiConfig cfg) {
        Identifier id = Identifier.tryParse(itemId == null ? "" : itemId);
        if (id == null || BANNED_ITEMS.contains(id.toString())) return Optional.empty();
        Optional<Item> item = BuiltInRegistries.ITEM.getOptional(id);
        if (item.isEmpty() || item.get() == Items.AIR) return Optional.empty();
        if (item.get().toString().contains("spawn_egg")) return Optional.empty();
        ItemStack stack = new ItemStack(item.get());
        int max = Math.min(stack.getMaxStackSize(), Math.max(1, cfg.maxVanillaItemCount));
        stack.setCount(Math.max(1, Math.min(count, max)));
        return Optional.of(new Outcome(stack, stack.getCount() + "x " + stack.getHoverName().getString()));
    }

    static String validEffect(String effectId) {
        Identifier id = Identifier.tryParse(effectId == null ? "" : effectId);
        if (id != null && BuiltInRegistries.MOB_EFFECT.containsKey(id)) return id.toString();
        return "minecraft:luck";
    }

    private static String pretty(String path) { return path.replace('_', ' '); }

    private static String clip(String s, int max, String fallback) {
        if (s == null || s.isBlank()) return fallback;
        s = s.strip().replaceAll("[\\p{Cntrl}§]", "");
        return s.length() > max ? s.substring(0, max) : s;
    }

    private ItemFactory() {}
}
