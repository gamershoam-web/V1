package com.aidraw.item;

import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;

/** Shoots fast, ammo-free bullets (arrows that can't be picked up). Power = damage. */
public class GunItem extends Item {
    public GunItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        int power = DrawnData.power(stack);
        if (!level.isClientSide()) {
            Arrow bullet = new Arrow(level, player, new ItemStack(Items.ARROW), stack);
            bullet.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0F, 5.0F, 0.2F);
            bullet.setBaseDamage(1.0 + power * 0.6);
            bullet.pickup = AbstractArrow.Pickup.CREATIVE_ONLY;
            bullet.setNoGravity(true);
            level.addFreshEntity(bullet);
            level.playSound(null, player.getX(), player.getY(), player.getZ(),
                    SoundEvents.FIREWORK_ROCKET_BLAST, SoundSource.PLAYERS, 1.0F, 1.6F);
        }
        player.getCooldowns().addCooldown(stack, Math.max(3, 12 - power * 2));
        return InteractionResult.SUCCESS;
    }
}
