package dev.lumen.bond;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.lumen.Lumen;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.entity.player.PlayerEntity;

/**
 * A player's bond with their Lumen, saved on the player (survives death and relogging).
 * The Lumen entity itself is disposable: it can dissolve and re-manifest next to its owner,
 * and the {@link #generation} counter makes any stale copy left in an unloaded chunk vanish.
 */
public final class Bond {
	public static final Codec<Bond> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.optionalFieldOf("trust", 10).forGetter(b -> b.trust),
		Codec.INT.optionalFieldOf("generation", 0).forGetter(b -> b.generation),
		Codec.BOOL.optionalFieldOf("bound", false).forGetter(b -> b.bound),
		Codec.BOOL.optionalFieldOf("staying", false).forGetter(b -> b.staying),
		Codec.BOOL.optionalFieldOf("received_vessel", false).forGetter(b -> b.receivedVessel),
		Codec.LONG.optionalFieldOf("last_summon", -1_000_000L).forGetter(b -> b.lastSummonTick),
		Codec.STRING.optionalFieldOf("name", "Lumen").forGetter(b -> b.name)
	).apply(i, Bond::new));

	public static final AttachmentType<Bond> ATTACHMENT = AttachmentRegistry.create(
		Lumen.id("bond"),
		b -> b.persistent(CODEC).copyOnDeath().initializer(Bond::new)
	);

	public int trust;
	public int generation;
	public boolean bound;
	public boolean staying;
	public boolean receivedVessel;
	public long lastSummonTick;
	public String name;

	public Bond(int trust, int generation, boolean bound, boolean staying, boolean receivedVessel, long lastSummonTick, String name) {
		this.trust = trust;
		this.generation = generation;
		this.bound = bound;
		this.staying = staying;
		this.receivedVessel = receivedVessel;
		this.lastSummonTick = lastSummonTick;
		this.name = name;
	}

	public Bond() {
		this(10, 0, false, false, false, -1_000_000L, "Lumen");
	}

	public static Bond of(PlayerEntity player) {
		return player.getAttachedOrCreate(ATTACHMENT);
	}

	public static void init() {
		// Forces class loading so the attachment type registers during mod init.
	}

	public void addTrust(int delta) {
		trust = Math.max(-100, Math.min(100, trust + delta));
	}

	public Mood mood(int hostilityThreshold) {
		if (trust <= hostilityThreshold) return Mood.HOSTILE;
		if (trust < 0) return Mood.UNEASY;
		return Mood.CALM;
	}

	public enum Mood {
		CALM, UNEASY, HOSTILE;

		public static Mood byId(int id) {
			Mood[] values = values();
			return values[Math.max(0, Math.min(values.length - 1, id))];
		}
	}
}
