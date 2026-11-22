package com.aidraw.item;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** A magic charm: right-click to get the status effect the AI chose for the drawing. */
public class CharmItem extends Item {
    public CharmItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        String effectId = DrawnData.string(stack, "effect");
        Identifier id = Identifier.tryParse(effectId);
        if (id == null) return InteractionResult.PASS;
        var effect = BuiltInRegistries.MOB_EFFECT.get(id);
        if (effect.isEmpty()) return InteractionResult.PASS;
        if (!level.isClientSide()) {
            int power = DrawnData.power(stack);
            player.addEffect(new MobEffectInstance(effect.get(), 20 * 30 * power, power >= 4 ? 1 : 0));
            level.playSound(null, player.getX(), player.getY(), player.getZ(),
                    SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 1.0F, 1.2F);
        }
        player.getCooldowns().addCooldown(stack, 20 * 60);
        return InteractionResult.SUCCESS;
    }
}
