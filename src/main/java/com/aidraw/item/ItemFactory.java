package com.aidraw.item;

import com.aidraw.ModItems;
import com.aidraw.ability.AbilityType;
import com.aidraw.ability.ItemSpec;
import com.aidraw.ai.AiConfig;
import com.aidraw.ai.DrawingResult;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.item.component.ItemLore;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/** Turns Claude's design into a real ItemStack (or a spawn egg / vanilla item). */
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
        String name = clip(r.name(), 30, "Mystery Drawing");
        String desc = clip(r.description(), 60, "");
        AiConfig cfg = AiConfig.get();
        String category = r.category() == null ? "CHARM" : r.category();

        if (category.equals("MOB")) {
            Optional<Outcome> mob = mob(player, r.mobId(), cfg);
            if (mob.isPresent()) return mob.get();
        }
        if (category.equals("VANILLA_ITEM") && cfg.allowVanillaItems) {
            Optional<Outcome> v = vanilla(r.vanillaId(), r.count(), cfg);
            if (v.isPresent()) return v.get();
        }

        ItemSpec spec = buildSpec(r.raw());
        Item item = switch (category) {
            case "GUN" -> ModItems.DRAWN_GUN;
            case "PLANE" -> ModItems.DRAWN_PLANE;
            case "SWORD" -> ModItems.DRAWN_SWORD;
            case "TOOL" -> ModItems.DRAWN_TOOL;
            case "BOMB" -> ModItems.DRAWN_BOMB;
            case "WAND" -> ModItems.DRAWN_WAND;
            case "FOOD" -> ModItems.DRAWN_FOOD;
            default -> ModItems.DRAWN_CHARM;
        };
        // An item with no powers at all would be useless: give it a little luck.
        if (item != ModItems.DRAWN_FOOD && spec.use().isEmpty() && spec.hit().isEmpty() && spec.passive().isEmpty()) {
            spec = new ItemSpec(List.of(), List.of(), List.of(new ItemSpec.Passive("minecraft:luck", 0)), 1, false);
        }
        return new Outcome(build(item, spec, name, desc, r.count(), r.attackDamage(), cfg), name);
    }

    /** Converts Claude's JSON (use_abilities / hit_abilities / passive_effects) into a validated ItemSpec. */
    public static ItemSpec buildSpec(JsonObject raw) {
        JsonObject o = new JsonObject();
        o.add("use", raw.has("use_abilities") ? raw.get("use_abilities") : new JsonArray());
        o.add("hit", raw.has("hit_abilities") ? raw.get("hit_abilities") : new JsonArray());
        JsonArray passive = new JsonArray();
        if (raw.has("passive_effects") && raw.get("passive_effects").isJsonArray()) {
            for (JsonElement e : raw.getAsJsonArray("passive_effects")) {
                if (e.isJsonObject() && validEffectOrNull(e.getAsJsonObject().get("effect_id")) != null) passive.add(e);
            }
        }
        o.add("passive", passive);
        o.add("cooldown_seconds", raw.has("cooldown_seconds") ? raw.get("cooldown_seconds") : new JsonPrimitive(1));
        o.add("consumable", raw.has("consumable") ? raw.get("consumable") : new JsonPrimitive(false));
        return ItemSpec.fromJsonObject(o, 10);
    }

    public static ItemStack build(Item item, ItemSpec spec, String name, String desc, int count, int attackDamage, AiConfig cfg) {
        ItemStack stack = new ItemStack(item, 1);
        // Damageable items (swords/tools) can never stack in Minecraft.
        if (stack.has(DataComponents.MAX_DAMAGE) && spec.consumable()) {
            spec = new ItemSpec(spec.use(), spec.hit(), spec.passive(), spec.cooldownSeconds(), false); // weapons/tools are never single-use
        }
        boolean stackable = (spec.consumable() || item == ModItems.DRAWN_FOOD) && !stack.has(DataComponents.MAX_DAMAGE);
        stack.set(DataComponents.MAX_STACK_SIZE, stackable ? 16 : 1);
        stack.setCount(stackable ? clampInt(count, 1, 16) : 1);

        CompoundTag tag = new CompoundTag();
        tag.putString("spec", spec.toJson());
        stack.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        stack.set(DataComponents.CUSTOM_NAME, Component.literal(name).withStyle(ChatFormatting.AQUA));

        if (attackDamage > 0) {
            int dmg = clampInt(attackDamage, 1, Math.max(1, cfg.maxAttackDamage));
            stack.set(DataComponents.ATTRIBUTE_MODIFIERS, ItemAttributeModifiers.builder()
                    .add(Attributes.ATTACK_DAMAGE, new AttributeModifier(Item.BASE_ATTACK_DAMAGE_ID, dmg - 1, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
                    .add(Attributes.ATTACK_SPEED, new AttributeModifier(Item.BASE_ATTACK_SPEED_ID, -2.4, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
                    .build());
        }

        boolean food = item == ModItems.DRAWN_FOOD;
        List<Component> lore = new ArrayList<>();
        if (!desc.isEmpty()) lore.add(Component.literal(desc).withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        for (ItemSpec.Ability a : spec.use()) {
            String how = a.type() == AbilityType.FLY ? "Hold right-click: " : food ? "When eaten: " : "Right-click: ";
            lore.add(line(how, a, ChatFormatting.GOLD));
        }
        for (ItemSpec.Ability a : spec.hit()) lore.add(line("On hit: ", a, ChatFormatting.RED));
        for (ItemSpec.Passive p : spec.passive()) {
            lore.add(Component.literal((food ? "When eaten: " : "While held: ") + pretty(p.effectId()) + " " + roman(p.amplifier() + 1))
                    .withStyle(ChatFormatting.BLUE));
        }
        if (spec.consumable()) lore.add(Component.literal("Single use").withStyle(ChatFormatting.DARK_GRAY));
        stack.set(DataComponents.LORE, new ItemLore(lore));
        return stack;
    }

    private static Component line(String prefix, ItemSpec.Ability a, ChatFormatting color) {
        String extra = a.type() == AbilityType.SUMMON && !a.entityId().isEmpty() ? " (" + pretty(a.entityId()) + ")"
                : (a.type() == AbilityType.EFFECT_SELF || a.type() == AbilityType.EFFECT_AREA) && !a.effectId().isEmpty() ? " (" + pretty(a.effectId()) + ")" : "";
        return Component.literal(prefix + a.type().label + extra + " Lv " + a.strength()).withStyle(color);
    }

    private static Optional<Outcome> mob(ServerPlayer player, String mobId, AiConfig cfg) {
        Identifier id = Identifier.tryParse(mobId == null ? "" : mobId.trim().toLowerCase(Locale.ROOT));
        if (id == null) return Optional.empty();
        if (!cfg.allowBossMobs && BOSS_MOBS.contains(id.toString())) return Optional.empty();
        Optional<EntityType<?>> type = BuiltInRegistries.ENTITY_TYPE.getOptional(id);
        if (type.isEmpty() || !type.get().canSummon() || type.get() == EntityType.PLAYER) return Optional.empty();

        // Prefer a spawn egg, so the player decides where it goes.
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
        Identifier id = Identifier.tryParse(itemId == null ? "" : itemId.trim().toLowerCase(Locale.ROOT));
        if (id == null || BANNED_ITEMS.contains(id.toString())) return Optional.empty();
        Optional<Item> item = BuiltInRegistries.ITEM.getOptional(id);
        if (item.isEmpty() || item.get() == Items.AIR || id.getPath().endsWith("spawn_egg")) return Optional.empty();
        ItemStack stack = new ItemStack(item.get());
        int max = Math.min(stack.getMaxStackSize(), Math.max(1, cfg.maxVanillaItemCount));
        stack.setCount(clampInt(count, 1, max));
        return Optional.of(new Outcome(stack, stack.getCount() + "x " + stack.getHoverName().getString()));
    }

    static String validEffectOrNull(JsonElement el) {
        if (el == null || !el.isJsonPrimitive()) return null;
        Identifier id = Identifier.tryParse(el.getAsString().trim().toLowerCase(Locale.ROOT));
        return id != null && BuiltInRegistries.MOB_EFFECT.containsKey(id) ? id.toString() : null;
    }

    private static String roman(int n) {
        return switch (n) { case 1 -> "I"; case 2 -> "II"; case 3 -> "III"; case 4 -> "IV"; case 5 -> "V"; default -> String.valueOf(n); };
    }

    private static int clampInt(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }

    private static String pretty(String path) {
        int i = path.indexOf(':');
        return (i >= 0 ? path.substring(i + 1) : path).replace('_', ' ');
    }

    private static String clip(String s, int max, String fallback) {
        if (s == null || s.isBlank()) return fallback;
        s = s.strip().replaceAll("[\\p{Cntrl}§]", "");
        return s.length() > max ? s.substring(0, max) : s;
    }

    private ItemFactory() {}
}
