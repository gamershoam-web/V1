package com.aidraw.item;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** Calls lightning where you look. Power = shorter cooldown. */
public class WandItem extends Item {
    public WandItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide()) {
            HitResult hit = player.pick(64.0, 0.0F, false);
            if (hit.getType() == HitResult.Type.MISS) return InteractionResult.FAIL;
            Vec3 pos = hit.getLocation();
            LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.TRIGGERED);
            if (bolt != null) {
                bolt.setPos(pos.x, pos.y, pos.z);
                level.addFreshEntity(bolt);
            }
        }
        player.getCooldowns().addCooldown(stack, 70 - DrawnData.power(stack) * 10);
        return InteractionResult.SUCCESS;
    }
}
