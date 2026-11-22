package com.aidraw.item;

import com.aidraw.ClientHooks;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;

public class PaintingBoardItem extends Item {
    public PaintingBoardItem(Properties properties) { super(properties); }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        if (level.isClientSide()) {
            ClientHooks.openDrawingScreen.run();
        }
        return InteractionResult.SUCCESS;
    }
}
