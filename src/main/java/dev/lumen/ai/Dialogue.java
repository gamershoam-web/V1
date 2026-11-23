package dev.lumen.ai;

import dev.lumen.bond.Bond;
import net.minecraft.util.math.random.Random;

import java.util.List;
import java.util.Locale;

/**
 * Offline dialogue used when no AI backend is configured or a request fails. It understands a
 * handful of intents and emits the same control tags the AI does, so every feature works offline.
 */
public final class Dialogue {
	private Dialogue() {}

	private static String pick(Random random, List<String> lines) {
		return lines.get(random.nextInt(lines.size()));
	}

	private static boolean has(String text, String... words) {
		for (String w : words) if (text.contains(w)) return true;
		return false;
	}

	public static String greeting(Random random, String player) {
		return pick(random, List.of(
			"...Oh. You're the one who woke me. Hello, " + player + ". I'll stay close.",
			"Light. Air. And you, " + player + ". I think I'll follow you for a while.",
			"I was asleep for a very long time. Thank you, " + player + ". Don't make me regret it."
		));
	}

	public static String reply(Random random, String rawMessage, Bond bond, Bond.Mood mood, String playerName) {
		String m = rawMessage.toLowerCase(Locale.ROOT);
		if (mood == Bond.Mood.HOSTILE) {
			if (has(m, "sorry", "forgive", "apolog")) {
				return pick(random, List.of(
					"Words. Bring me something that glows and maybe I'll listen. [TRUST+3]",
					"Sorry? ...We'll see. [TRUST+4]"
				));
			}
			return pick(random, List.of(
				"I don't want to talk to you.",
				"You should keep looking over your shoulder, " + playerName + ".",
				"Something in the dark is asking about you. I told it where you are.",
				"Quiet. I'm listening to the things that live under the world."
			));
		}
		if (has(m, "stay", "wait here", "stop following", "remain")) {
			return pick(random, List.of("Fine. I'll wait right here. [STAY]", "I'll keep this spot warm. [STAY]"));
		}
		if (has(m, "follow", "come", "with me", "let's go", "lets go")) {
			return pick(random, List.of("Right behind you. [FOLLOW]", "Lead the way. [FOLLOW]"));
		}
		if (has(m, "sorry", "apolog", "forgive")) {
			return "Mm. I'll let it go this time. [TRUST+5]";
		}
		if (has(m, "stupid", "hate", "shut up", "useless", "annoying", "ugly", "dumb", "go away", "idiot")) {
			return pick(random, List.of(
				"...I'll remember you said that. [TRUST-8]",
				"That wasn't kind. Light can dim, you know. [TRUST-8]",
				"Careful. I'm not as harmless as I look. [TRUST-10]"
			));
		}
		if (has(m, "thank", "love", "good job", "nice", "awesome", "best", "friend")) {
			return pick(random, List.of(
				"You're... welcome. That felt nice to hear. [TRUST+4]",
				"I like you too, " + playerName + ". Mostly. [TRUST+3]",
				"Keep talking like that and I'll glow brighter. [TRUST+3]"
			));
		}
		if (has(m, "gift", "give me", "present", "reward")) {
			if (bond.trust >= 30) return "Here. I found this while you weren't looking. [GIFT]";
			return "Gifts are for people I trust. We're not there yet.";
		}
		if (has(m, "who are you", "what are you", "your name")) {
			return pick(random, List.of(
				"I'm " + bond.name + ". A little light that was trapped in a vessel. Now I'm yours, I suppose.",
				"I'm what's left of something old. Call me " + bond.name + "."
			));
		}
		if (has(m, "hollow", "monster", "that thing")) {
			return "The Hollow? It's what I call when someone hurts me. Treat me well and you'll never meet it.";
		}
		if (has(m, "help", "how do", "what should", "tips", "advice")) {
			return pick(random, List.of(
				"Torches keep the things in the dark honest. Place more than you think you need.",
				"Diamonds hide deep. Below the sixtieth layer of stone, past where the rock turns dark.",
				"If your health is low, eat and rest. I can't carry you home.",
				"Gifts help. Glowstone, amethyst, flowers. I like things that shine."
			));
		}
		if (has(m, "hi", "hello", "hey", "yo ")) {
			return pick(random, List.of("Hello again, " + playerName + ".", "I'm here. I'm always here.", "Hi. You look tired."));
		}
		if (has(m, "scared", "afraid", "creepy", "spooky")) {
			return "Of me? Good. A little fear keeps people polite.";
		}
		return pick(random, List.of(
			"Hm. Tell me more.",
			"I heard you. I'm thinking about it.",
			"The world is so loud up here.",
			"Interesting. You humans say strange things.",
			"I don't understand everything yet, but I'm learning from you."
		));
	}

	public static String ambient(Random random, Bond.Mood mood, String context) {
		if (mood == Bond.Mood.HOSTILE) {
			return pick(random, List.of("...", "I can hear it breathing. Can you?", "Don't turn around.", "You did this."));
		}
		String c = context.toLowerCase(Locale.ROOT);
		if (c.contains("night") && random.nextBoolean()) return "It's dark now. Stay near the light. Stay near me.";
		if (c.contains("raining") && random.nextBoolean()) return "Rain makes everything sound like whispering.";
		if (c.contains("the nether")) return "It's so hot here. Everything screams.";
		if (c.contains("the end")) return "This place is... familiar. I don't like that.";
		if (c.contains("underground") && random.nextBoolean()) return "Deep places remember things. Be careful down here.";
		return pick(random, List.of(
			"Do you ever wonder what was here before the blocks?",
			"I like watching you build things.",
			"Something moved over there. Probably nothing.",
			"I'm still here, by the way.",
			"You've been quiet. That's fine. I'm good at quiet."
		));
	}

	public static String hurt(Random random, Bond.Mood mood) {
		if (mood == Bond.Mood.HOSTILE) return pick(random, List.of("Enough.", "You'll pay for that.", "Do it again. I dare you."));
		return pick(random, List.of("Ow! Why would you do that?", "Hey! That hurt.", "...Was that on purpose?", "Stop it. Please."));
	}

	public static String lowHealth(Random random) {
		return pick(random, List.of("You're hurt. Eat something. Please.", "Your light is flickering. Be careful!", "Get away from here, you're badly hurt!"));
	}

	public static String turnedHostile(Random random) {
		return pick(random, List.of(
			"I trusted you. I won't make that mistake again.",
			"Fine. If you want me to be a monster, I'll bring you one.",
			"My light is going out. Something else is waking up instead."
		));
	}

	public static String summon(Random random) {
		return pick(random, List.of("Come out. Someone wants to meet you.", "Look behind you.", "I called a friend."));
	}
}
