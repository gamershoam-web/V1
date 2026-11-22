package com.aidraw;

import com.aidraw.ai.AiConfig;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;

/**
 * /aidraw key &lt;key&gt;  — set the Anthropic API key from inside the game (operators only). Takes effect immediately.
 * /aidraw key clear    — remove it (back to free offline mode)
 * /aidraw status       — show whether the AI is on
 */
public final class AiDrawCommand {
    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registry, env) -> dispatcher.register(
                Commands.literal("aidraw")
                        .then(Commands.literal("status").executes(AiDrawCommand::status))
                        .then(Commands.literal("key")
                                .requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
                                .then(Commands.literal("clear").executes(ctx -> setKey(ctx, "")))
                                .then(Commands.argument("key", StringArgumentType.greedyString())
                                        .executes(ctx -> setKey(ctx, StringArgumentType.getString(ctx, "key")))))));
    }

    private static int status(CommandContext<CommandSourceStack> ctx) {
        AiConfig cfg = AiConfig.get();
        if (cfg.hasKey()) {
            ctx.getSource().sendSuccess(() -> Component.literal("AI Drawing: ON — " + com.aidraw.ai.AiRouter.name() + " (" + (com.aidraw.ai.AiRouter.provider() == com.aidraw.ai.AiRouter.Provider.CLAUDE ? cfg.model : cfg.geminiModel) + ") looks at every drawing.").withStyle(ChatFormatting.GREEN), false);
        } else {
            ctx.getSource().sendSuccess(() -> Component.literal("AI Drawing: OFFLINE mode — type what you drew in the hint box. For free AI, get a Gemini key at aistudio.google.com and an operator runs /aidraw key <key>").withStyle(ChatFormatting.YELLOW), false);
        }
        return 1;
    }

    private static int setKey(CommandContext<CommandSourceStack> ctx, String rawKey) {
        final String key = rawKey.trim();
        // Google has several key formats (AIza..., AQ....), so only sanity-check the shape.
        if (!key.isEmpty() && (key.length() < 20 || key.length() > 300 || !key.matches("[A-Za-z0-9._\\-]+"))) {
            ctx.getSource().sendFailure(Component.literal("That doesn't look like an API key. Copy the whole key from aistudio.google.com/apikey and try again."));
            return 0;
        }
        AiConfig.get().apiKey = key;
        boolean saved = AiConfig.save();
        String shown = key.isEmpty() ? "" : key.substring(0, Math.min(10, key.length())) + "…" + key.substring(Math.max(0, key.length() - 4));
        // Feedback goes only to the sender (false = not broadcast to other operators), and the key is masked.
        ctx.getSource().sendSuccess(() -> Component.literal(key.isEmpty()
                ? "AI key removed. Drawings now use free offline mode."
                : "AI key set (" + shown + "). " + com.aidraw.ai.AiRouter.name() + " will now look at every drawing — no restart needed!"
                + (saved ? "" : " (couldn't save to config — it will reset on restart)")).withStyle(ChatFormatting.GREEN), false);
        return 1;
    }

    private AiDrawCommand() {}
}
