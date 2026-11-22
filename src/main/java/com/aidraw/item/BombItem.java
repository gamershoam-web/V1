package com.aidraw.item;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** Explodes wherever you look (up to 48 blocks away). Power = blast size. Single use. */
public class BombItem extends Item {
    public BombItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide()) {
            HitResult hit = player.pick(48.0, 0.0F, false);
            if (hit.getType() == HitResult.Type.MISS) return InteractionResult.FAIL;
            Vec3 pos = hit.getLocation();
            if (pos.distanceToSqr(player.position()) < 16.0) return InteractionResult.FAIL; // too close, protect the player
            float strength = 1.5F + DrawnData.power(stack) * 0.8F;
            level.explode(player, pos.x, pos.y, pos.z, strength, Level.ExplosionInteraction.TNT);
            stack.consume(1, player);
        }
        player.getCooldowns().addCooldown(stack, 20);
        return InteractionResult.SUCCESS;
    }
}
