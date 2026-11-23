package dev.lumen;

import dev.lumen.ai.LumenConfig;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import dev.lumen.command.LumenCommand;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.message.v1.ServerMessageEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;

public class Lumen implements ModInitializer {
	public static final String MOD_ID = "lumen";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.of(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		LumenConfig.load();
		Bond.init();
		LumenRegistry.init();

		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> LumenCommand.register(dispatcher));
		ServerTickEvents.END_SERVER_TICK.register(BondManager::tick);
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> BondManager.onJoin(handler.getPlayer()));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> BondManager.onLeave(handler.getPlayer()));
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> BondManager.onServerStopped());

		// Chat messages starting with the trigger word (or your Lumen's name) are spoken to Lumen.
		ServerMessageEvents.ALLOW_CHAT_MESSAGE.register((message, sender, params) -> {
			String content = message.getSignedContent();
			String addressed = stripAddress(sender, content);
			if (addressed == null) return true;
			sender.getEntityWorld().getServer().execute(() -> LumenCommand.talk(sender, addressed));
			return !LumenConfig.get().privateConversations;
		});

		LOGGER.info("Lumen is awake. AI backend: {}", LumenConfig.get().aiAvailable() ? LumenConfig.get().apiUrl : "offline dialogue");
	}

	/** Returns the message with the address word removed, or null if it was not addressed to Lumen. */
	@Nullable
	private static String stripAddress(ServerPlayerEntity sender, String content) {
		Bond bond = Bond.of(sender);
		if (!bond.bound) return null;
		String trimmed = content.trim();
		String lower = trimmed.toLowerCase(Locale.ROOT);
		for (String word : new String[]{LumenConfig.get().chatTrigger, bond.name}) {
			if (word == null || word.isBlank()) continue;
			String w = word.toLowerCase(Locale.ROOT);
			if (lower.equals(w)) return "Hey.";
			if (lower.startsWith(w) && lower.length() > w.length()) {
				char next = lower.charAt(w.length());
				if (next == ',' || next == ':' || next == ' ' || next == '!' || next == '?') {
					String rest = trimmed.substring(w.length()).replaceFirst("^[,:!?\\s]+", "").trim();
					return rest.isEmpty() ? "Hey." : rest;
				}
			}
		}
		return null;
	}
}
