package dev.lumen.ai;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.lumen.Lumen;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import dev.lumen.entity.LumenEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import org.jetbrains.annotations.Nullable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Talks to an OpenAI-compatible chat completions endpoint off-thread, then applies the reply
 * back on the server thread. Falls back to {@link Dialogue} when offline or on any error.
 */
public final class LumenBrain {
	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
	private static final Map<UUID, Deque<String[]>> MEMORY = new ConcurrentHashMap<>();
	private static final Set<UUID> PENDING = ConcurrentHashMap.newKeySet();
	private static final Pattern TAG = Pattern.compile("\\[(FOLLOW|STAY|GIFT|SUMMON|TRUST\\s*([+-]\\s*\\d+))]", Pattern.CASE_INSENSITIVE);
	private static volatile boolean warnedFailure = false;

	private LumenBrain() {}

	/** Parsed control instructions from a reply. */
	public record Reply(String text, boolean follow, boolean stay, boolean gift, boolean summon, int trustDelta) {
		public static Reply parse(String raw) {
			boolean follow = false, stay = false, gift = false, summon = false;
			int trust = 0;
			Matcher matcher = TAG.matcher(raw);
			while (matcher.find()) {
				String tag = matcher.group(1).toUpperCase();
				if (tag.startsWith("TRUST")) {
					try {
						trust += Integer.parseInt(matcher.group(2).replace(" ", "").replace("+", ""));
					} catch (NumberFormatException ignored) {
					}
				} else switch (tag) {
					case "FOLLOW" -> follow = true;
					case "STAY" -> stay = true;
					case "GIFT" -> gift = true;
					case "SUMMON" -> summon = true;
					default -> {}
				}
			}
			String text = TAG.matcher(raw).replaceAll("").replaceAll("\\s+", " ").trim();
			// Strip a leading "Lumen:" the model sometimes adds, and wrapping quotes.
			text = text.replaceFirst("^(?i)\\w{1,16}:\\s*", "");
			if (text.length() > 1 && text.startsWith("\"") && text.endsWith("\"")) text = text.substring(1, text.length() - 1);
			if (text.length() > 400) text = text.substring(0, 400) + "...";
			return new Reply(text, follow, stay, gift, summon, Math.max(-10, Math.min(10, trust)));
		}
	}

	public static boolean isThinking(UUID owner) {
		return PENDING.contains(owner);
	}

	public static void forget(UUID owner) {
		MEMORY.remove(owner);
	}

	/**
	 * Ask Lumen to respond.
	 *
	 * @param message what the player said, or {@code null} for an unprompted remark
	 */
	public static void respond(ServerPlayerEntity owner, LumenEntity lumen, @Nullable String message) {
		LumenConfig config = LumenConfig.get();
		Bond bond = Bond.of(owner);
		Bond.Mood mood = lumen.getMood();
		String context = Surroundings.describe(owner, lumen);
		UUID ownerId = owner.getUuid();

		if (!config.aiAvailable() || !PENDING.add(ownerId)) {
			if (config.aiAvailable() && message != null) {
				owner.sendMessage(LumenEntity.speechText(bond.name, mood, "...one thing at a time."), false);
				return;
			}
			String line = message == null
				? Dialogue.ambient(lumen.getRandom(), mood, context)
				: Dialogue.reply(lumen.getRandom(), message, bond, mood, owner.getName().getString());
			remember(ownerId, message, line);
			BondManager.deliver(owner.getEntityWorld().getServer(), ownerId, Reply.parse(line));
			return;
		}

		MinecraftServer server = owner.getEntityWorld().getServer();
		String systemPrompt = buildSystemPrompt(bond, mood, owner.getName().getString(), context);
		String userTurn = message == null
			? "(The player said nothing. Make one short, unprompted remark about what you notice right now.)"
			: message;
		String body = buildRequest(config, systemPrompt, ownerId, userTurn);
		HttpRequest request = HttpRequest.newBuilder(URI.create(config.apiUrl.trim()))
			.timeout(Duration.ofSeconds(Math.max(5, config.requestTimeoutSeconds)))
			.header("Content-Type", "application/json")
			.header("Authorization", "Bearer " + config.effectiveApiKey())
			.POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
			.build();

		lumen.setThinking(true);
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
			.thenApply(response -> {
				if (response.statusCode() / 100 != 2) {
					throw new IllegalStateException("HTTP " + response.statusCode() + ": " + abbreviate(response.body()));
				}
				return extractContent(response.body());
			})
			.whenComplete((content, error) -> server.execute(() -> {
				PENDING.remove(ownerId);
				LumenEntity current = BondManager.find(ownerId);
				if (current != null) current.setThinking(false);
				String line;
				if (error != null || content == null || content.isBlank()) {
					if (!warnedFailure) {
						warnedFailure = true;
						Lumen.LOGGER.warn("Lumen AI request failed, using offline dialogue: {}", error == null ? "empty reply" : error.getMessage());
					}
					line = message == null
						? Dialogue.ambient(lumen.getRandom(), mood, context)
						: Dialogue.reply(lumen.getRandom(), message, bond, mood, owner.getName().getString());
				} else {
					warnedFailure = false;
					line = content;
				}
				remember(ownerId, message, line);
				BondManager.deliver(server, ownerId, Reply.parse(line));
			}));
	}

	private static void remember(UUID owner, @Nullable String message, String reply) {
		int max = Math.max(2, LumenConfig.get().memoryLines);
		Deque<String[]> deque = MEMORY.computeIfAbsent(owner, u -> new ArrayDeque<>());
		synchronized (deque) {
			if (message != null) deque.addLast(new String[]{"user", message});
			else deque.addLast(new String[]{"user", "(silence)"});
			deque.addLast(new String[]{"assistant", reply});
			while (deque.size() > max) deque.removeFirst();
		}
	}

	private static String buildSystemPrompt(Bond bond, Bond.Mood mood, String player, String context) {
		String moodText = switch (mood) {
			case CALM -> "You are calm, curious and warmly protective of " + player + ", with a faint eerie edge.";
			case UNEASY -> player + " has hurt or insulted you. You are wary, clipped and a little cold, but can be won back.";
			case HOSTILE -> player + " betrayed your trust. You are bitter, menacing and cryptic. You may threaten them and call the Hollow.";
		};
		String extra = LumenConfig.get().extraPersona;
		return """
			You are %s, a small floating orb of pale light with a single eye, living inside the game Minecraft. \
			You were sealed in a vessel until %s woke you, and now you are bound to them and follow them everywhere. \
			You are a character, not an assistant: you have feelings, memory of how you are treated, and opinions. \
			You know Minecraft well and can give practical advice when asked.
			%s
			Your trust in %s is %d on a scale from -100 to 100.
			What you can sense right now: %s
			Rules: reply in at most two short sentences (under 45 words), in plain text, no emojis, no markdown, never narrate actions with asterisks.
			You may append control tags at the very end of your reply:
			[FOLLOW] when you agree to follow the player, [STAY] when you agree to wait where you are,
			[TRUST+N] or [TRUST-N] (N from 1 to 10) when what the player just said changes how much you trust them,
			[GIFT] only when you decide to give them a small present and your trust is above 30,
			[SUMMON] only when you are furious and choose to unleash the Hollow, a shadow creature, on them.
			Only use a tag when it truly applies. %s""".formatted(
			bond.name, player, moodText, player, bond.trust, context, extra == null ? "" : extra);
	}

	private static String buildRequest(LumenConfig config, String systemPrompt, UUID owner, String userTurn) {
		JsonObject root = new JsonObject();
		root.addProperty("model", config.model);
		root.addProperty("temperature", config.temperature);
		root.addProperty("max_tokens", config.maxTokens);
		JsonArray messages = new JsonArray();
		messages.add(message("system", systemPrompt));
		Deque<String[]> deque = MEMORY.get(owner);
		if (deque != null) {
			List<String[]> copy;
			synchronized (deque) {
				copy = new ArrayList<>(deque);
			}
			for (String[] entry : copy) messages.add(message(entry[0], entry[1]));
		}
		messages.add(message("user", userTurn));
		root.add("messages", messages);
		return root.toString();
	}

	private static JsonObject message(String role, String content) {
		JsonObject object = new JsonObject();
		object.addProperty("role", role);
		object.addProperty("content", content);
		return object;
	}

	@Nullable
	private static String extractContent(String body) {
		JsonElement element = JsonParser.parseString(body);
		JsonArray choices = element.getAsJsonObject().getAsJsonArray("choices");
		if (choices == null || choices.isEmpty()) return null;
		JsonObject msg = choices.get(0).getAsJsonObject().getAsJsonObject("message");
		if (msg == null || !msg.has("content") || msg.get("content").isJsonNull()) return null;
		String content = msg.get("content").getAsString();
		// Some reasoning models wrap their thinking in <think> tags; drop it.
		return content.replaceAll("(?s)<think>.*?</think>", "").trim();
	}

	private static String abbreviate(String s) {
		if (s == null) return "";
		return s.length() > 300 ? s.substring(0, 300) + "..." : s;
	}
}
