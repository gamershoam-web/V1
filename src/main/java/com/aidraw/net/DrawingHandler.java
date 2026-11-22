package com.aidraw.net;

import com.aidraw.AiDrawMod;
import com.aidraw.ModItems;
import com.aidraw.Palette;
import com.aidraw.ai.AiConfig;
import com.aidraw.ai.ClaudeClient;
import com.aidraw.ai.DrawingResult;
import com.aidraw.ai.OfflineDesigner;
import com.aidraw.item.ItemFactory;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Server side: validates a submitted drawing, asks Claude, and gives the player the item. */
public final class DrawingHandler {
    private static final Set<UUID> IN_FLIGHT = ConcurrentHashMap.newKeySet();
    private static final Map<UUID, Long> LAST_USE = new ConcurrentHashMap<>();

    public static void handle(SubmitDrawingPayload payload, ServerPlayNetworking.Context ctx) {
        ServerPlayer player = ctx.player();
        MinecraftServer server = ctx.server();
        UUID id = player.getUUID();
        AiConfig cfg = AiConfig.get();

        if (!player.getMainHandItem().is(ModItems.PAINTING_BOARD) && !player.getOffhandItem().is(ModItems.PAINTING_BOARD)) {
            return; // must be holding a board
        }
        byte[] pixels = payload.pixels();
        if (pixels.length != Palette.SIZE * Palette.SIZE) return;
        boolean empty = true;
        for (byte b : pixels) if (b != 0) { empty = false; break; }
        if (empty) { say(player, "Draw something first!", ChatFormatting.YELLOW); return; }

        String hint = payload.hint() == null ? "" : payload.hint().strip();
        if (!cfg.hasKey() && hint.isEmpty()) {
            say(player, "Offline mode: type what you drew in the box under the canvas (e.g. \"atom bomb\", \"crazy fire sword\").", ChatFormatting.YELLOW);
            say(player, "For AI that looks at your drawing, the server owner runs: /aidraw key <anthropic-api-key>", ChatFormatting.GRAY);
            return;
        }
        if (IN_FLIGHT.contains(id)) { say(player, "Still working on your last drawing...", ChatFormatting.YELLOW); return; }
        long now = System.currentTimeMillis();
        long wait = LAST_USE.getOrDefault(id, 0L) + cfg.cooldownSeconds * 1000L - now;
        if (wait > 0 && !player.isCreative()) {
            say(player, "The paint is still drying... wait " + (wait / 1000 + 1) + "s", ChatFormatting.YELLOW);
            return;
        }
        LAST_USE.put(id, now);

        if (!cfg.hasKey()) {
            give(player, OfflineDesigner.design(hint));
            return;
        }

        IN_FLIGHT.add(id);
        say(player, "✎ Claude is looking at your drawing...", ChatFormatting.AQUA);

        ClaudeClient.classify(pixels, hint).whenComplete((result, error) -> server.execute(() -> {
            IN_FLIGHT.remove(id);
            ServerPlayer target = server.getPlayerList().getPlayer(id);
            if (target == null) return; // logged off
            if (error != null) {
                Throwable cause = error.getCause() != null ? error.getCause() : error;
                AiDrawMod.LOGGER.warn("Drawing failed for {}", target.getName().getString(), cause);
                DrawingResult offline = OfflineDesigner.design(hint);
                if (offline != null) {
                    say(target, "AI unavailable (" + cause.getMessage() + ") — using offline mode.", ChatFormatting.GRAY);
                    give(target, offline);
                } else {
                    say(target, "The drawing fizzled: " + cause.getMessage(), ChatFormatting.RED);
                    LAST_USE.remove(id); // don't punish failures with a cooldown
                }
                return;
            }
            give(target, result);
        }));
    }

    private static void give(ServerPlayer player, DrawingResult result) {
        try {
            ItemFactory.Outcome outcome = ItemFactory.create(player, result);
            if (outcome.stack() != null && !outcome.stack().isEmpty()) {
                if (!player.getInventory().add(outcome.stack())) player.drop(outcome.stack(), false);
            }
            player.sendSystemMessage(Component.literal("✦ Your drawing became: ").withStyle(ChatFormatting.GREEN)
                    .append(Component.literal(outcome.label()).withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD)));
        } catch (Exception e) {
            AiDrawMod.LOGGER.error("Could not create item from {}", result, e);
            say(player, "Something went wrong creating your item.", ChatFormatting.RED);
        }
    }

    private static void say(ServerPlayer player, String msg, ChatFormatting color) {
        player.sendSystemMessage(Component.literal(msg).withStyle(color));
    }

    private DrawingHandler() {}
}
