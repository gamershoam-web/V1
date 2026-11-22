package com.aidraw.item;

import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;

/** Small helpers for the per-stack values the AI decides (power, effect id, ...). */
public final class DrawnData {
    public static CompoundTag tag(ItemStack stack) {
        return stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
    }

    public static int power(ItemStack stack) {
        return Math.max(1, Math.min(5, tag(stack).getIntOr("power", 2)));
    }

    public static String string(ItemStack stack, String key) {
        return tag(stack).getStringOr(key, "");
    }

    private DrawnData() {}
}
