package com.aidraw.item;

import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/** Hold right-click to fly where you look. Release to glide down safely. Power = speed. */
public class PlaneItem extends Item {
    public PlaneItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        player.startUsingItem(hand);
        return InteractionResult.CONSUME;
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity entity) { return 72000; }

    @Override
    public ItemUseAnimation getUseAnimation(ItemStack stack) { return ItemUseAnimation.SPEAR; }

    @Override
    public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remaining) {
        double speed = 0.4 + DrawnData.power(stack) * 0.15;
        Vec3 look = entity.getLookAngle();
        // Thrust applied on both sides: the client owns player movement, the server keeps fall damage off.
        entity.setDeltaMovement(look.scale(speed));
        entity.resetFallDistance();
        if (level instanceof ServerLevel server) {
            server.sendParticles(ParticleTypes.CLOUD, entity.getX(), entity.getY() + 0.5, entity.getZ(), 1, 0.2, 0.1, 0.2, 0.0);
        }
    }

    @Override
    public void inventoryTick(ItemStack stack, ServerLevel level, net.minecraft.world.entity.Entity entity, net.minecraft.world.entity.EquipmentSlot slot) {
        // Holding the plane (main or off hand) = parachute: no fall damage, slow descent.
        if (entity instanceof Player player && (player.getMainHandItem() == stack || player.getOffhandItem() == stack)) {
            player.resetFallDistance();
        }
    }
}
