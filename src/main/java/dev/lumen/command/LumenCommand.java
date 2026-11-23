package dev.lumen.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.lumen.ai.LumenBrain;
import dev.lumen.ai.LumenConfig;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import dev.lumen.entity.LumenEntity;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import static net.minecraft.server.command.CommandManager.argument;
import static net.minecraft.server.command.CommandManager.literal;

public final class LumenCommand {
	private LumenCommand() {}

	public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
		dispatcher.register(literal("lumen")
			.executes(ctx -> help(ctx.getSource()))
			.then(literal("help").executes(ctx -> help(ctx.getSource())))
			.then(literal("say").then(argument("message", StringArgumentType.greedyString())
				.executes(ctx -> talk(ctx.getSource().getPlayerOrThrow(), StringArgumentType.getString(ctx, "message")))))
			.then(literal("call").executes(LumenCommand::call))
			.then(literal("stay").executes(ctx -> setStaying(ctx, true)))
			.then(literal("follow").executes(ctx -> setStaying(ctx, false)))
			.then(literal("status").executes(LumenCommand::status))
			.then(literal("name").then(argument("name", StringArgumentType.word()).executes(LumenCommand::rename)))
			.then(literal("forget").executes(ctx -> {
				LumenBrain.forget(ctx.getSource().getPlayerOrThrow().getUuid());
				ctx.getSource().sendFeedback(() -> Text.translatable("command.lumen.forget"), false);
				return 1;
			}))
			.then(literal("release").executes(ctx -> {
				ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
				if (!Bond.of(player).bound) return noLumen(ctx.getSource());
				BondManager.release(player);
				return 1;
			}))
			.then(literal("reload")
				.requires(CommandManager.requirePermissionLevel(CommandManager.GAMEMASTERS_CHECK))
				.executes(ctx -> {
					LumenConfig.load();
					ctx.getSource().sendFeedback(() -> Text.translatable("command.lumen.reloaded",
						LumenConfig.get().aiAvailable() ? Text.translatable("command.lumen.ai_on") : Text.translatable("command.lumen.ai_off")), true);
					return 1;
				}))
			.then(literal("trust")
				.requires(CommandManager.requirePermissionLevel(CommandManager.GAMEMASTERS_CHECK))
				.then(argument("value", IntegerArgumentType.integer(-100, 100)).executes(ctx -> {
					ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
					int value = IntegerArgumentType.getInteger(ctx, "value");
					Bond.of(player).trust = value;
					ctx.getSource().sendFeedback(() -> Text.translatable("command.lumen.trust_set", value), true);
					return 1;
				})))
		);
	}

	private static int help(ServerCommandSource source) {
		String trigger = LumenConfig.get().chatTrigger;
		source.sendFeedback(() -> Text.translatable("command.lumen.help", trigger).formatted(Formatting.GRAY), false);
		return 1;
	}

	private static int noLumen(ServerCommandSource source) {
		source.sendError(Text.translatable("command.lumen.no_lumen"));
		return 0;
	}

	/** Shared entry point for chat messages and /lumen say. */
	public static int talk(ServerPlayerEntity player, String message) {
		Bond bond = Bond.of(player);
		if (!bond.bound) {
			player.sendMessage(Text.translatable("command.lumen.no_lumen").formatted(Formatting.GRAY), false);
			return 0;
		}
		LumenEntity lumen = BondManager.find(player.getUuid());
		if (lumen == null || lumen.getEntityWorld() != player.getEntityWorld() || lumen.squaredDistanceTo(player) > 32 * 32) {
			player.sendMessage(Text.translatable("command.lumen.too_far").formatted(Formatting.GRAY), false);
			return 0;
		}
		player.sendMessage(Text.literal("You → " + bond.name + ": ").formatted(Formatting.DARK_GRAY)
			.append(Text.literal(message).formatted(Formatting.GRAY)), false);
		LumenBrain.respond(player, lumen, message);
		return 1;
	}

	private static int call(CommandContext<ServerCommandSource> ctx) throws CommandSyntaxException {
		ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
		Bond bond = Bond.of(player);
		if (!bond.bound) return noLumen(ctx.getSource());
		bond.staying = false;
		LumenEntity lumen = BondManager.find(player.getUuid());
		if (lumen != null && lumen.getEntityWorld() == player.getEntityWorld() && lumen.squaredDistanceTo(player) < 40 * 40) {
			lumen.setStaying(false);
			lumen.say(player, "I'm here.");
		} else {
			LumenEntity fresh = BondManager.manifest(player, null, false);
			if (fresh != null) fresh.say(player, "You called?");
		}
		return 1;
	}

	private static int setStaying(CommandContext<ServerCommandSource> ctx, boolean staying) throws CommandSyntaxException {
		ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
		Bond bond = Bond.of(player);
		if (!bond.bound) return noLumen(ctx.getSource());
		LumenEntity lumen = BondManager.find(player.getUuid());
		if (!staying && (lumen == null || lumen.getEntityWorld() != player.getEntityWorld())) return call(ctx);
		bond.staying = staying;
		if (lumen != null) {
			lumen.setStaying(staying);
			lumen.say(player, staying ? "I'll wait here." : "Coming.");
		}
		return 1;
	}

	private static int status(CommandContext<ServerCommandSource> ctx) throws CommandSyntaxException {
		ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
		Bond bond = Bond.of(player);
		if (!bond.bound) return noLumen(ctx.getSource());
		Bond.Mood mood = bond.mood(LumenConfig.get().hostilityThreshold);
		ctx.getSource().sendFeedback(() -> Text.translatable("command.lumen.status",
			bond.name,
			bond.trust,
			Text.translatable("mood.lumen." + mood.name().toLowerCase()),
			Text.translatable(bond.staying ? "command.lumen.mode_stay" : "command.lumen.mode_follow"),
			LumenConfig.get().aiAvailable() ? Text.translatable("command.lumen.ai_on") : Text.translatable("command.lumen.ai_off")), false);
		return 1;
	}

	private static int rename(CommandContext<ServerCommandSource> ctx) throws CommandSyntaxException {
		ServerPlayerEntity player = ctx.getSource().getPlayerOrThrow();
		Bond bond = Bond.of(player);
		if (!bond.bound) return noLumen(ctx.getSource());
		String name = StringArgumentType.getString(ctx, "name");
		if (name.length() > 16) name = name.substring(0, 16);
		bond.name = name;
		LumenBrain.forget(player.getUuid());
		LumenEntity lumen = BondManager.find(player.getUuid());
		if (lumen != null) lumen.say(player, name + "... I like that.");
		return 1;
	}
}
