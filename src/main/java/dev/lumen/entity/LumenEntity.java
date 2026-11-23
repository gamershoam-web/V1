package dev.lumen.entity;

import dev.lumen.LumenRegistry;
import dev.lumen.ai.Dialogue;
import dev.lumen.ai.LumenBrain;
import dev.lumen.ai.LumenConfig;
import dev.lumen.bond.Bond;
import dev.lumen.bond.BondManager;
import dev.lumen.voice.VoicePackets;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.registry.tag.ItemTags;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.Uuids;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.UUID;

/**
 * Lumen: a floating orb of light bound to one player. It hovers over its owner's shoulder,
 * talks (via {@link LumenBrain}), reacts to how it is treated, and turns on its owner when
 * trust collapses.
 */
public class LumenEntity extends PathAwareEntity {
	private static final TrackedData<Integer> MOOD = DataTracker.registerData(LumenEntity.class, TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Boolean> THINKING = DataTracker.registerData(LumenEntity.class, TrackedDataHandlerRegistry.BOOLEAN);
	private static final TrackedData<Boolean> STAYING = DataTracker.registerData(LumenEntity.class, TrackedDataHandlerRegistry.BOOLEAN);

	@Nullable
	private UUID ownerUuid;
	private int generation;
	@Nullable
	private Vec3d anchor;
	private int ambientCooldown = 2400;
	private int lowHealthCooldown;
	private int giftCooldown;
	private int trustDriftTimer;
	private int ownerMissingTicks;
	private Bond.Mood lastMood = Bond.Mood.CALM;

	public LumenEntity(EntityType<? extends LumenEntity> type, World world) {
		super(type, world);
		this.setNoGravity(true);
		this.noClip = true;
		this.experiencePoints = 0;
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return MobEntity.createMobAttributes()
			.add(EntityAttributes.MAX_HEALTH, 20.0)
			.add(EntityAttributes.FLYING_SPEED, 0.6)
			.add(EntityAttributes.MOVEMENT_SPEED, 0.3);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(MOOD, 0);
		builder.add(THINKING, false);
		builder.add(STAYING, false);
	}

	// ---------------------------------------------------------------- state

	public Bond.Mood getMood() {
		return Bond.Mood.byId(this.dataTracker.get(MOOD));
	}

	public boolean isThinking() {
		return this.dataTracker.get(THINKING);
	}

	public void setThinking(boolean thinking) {
		this.dataTracker.set(THINKING, thinking);
	}

	public boolean isStaying() {
		return this.dataTracker.get(STAYING);
	}

	public void setStaying(boolean staying) {
		this.dataTracker.set(STAYING, staying);
		this.anchor = staying ? this.getEntityPos() : null;
	}

	@Nullable
	public UUID getOwnerUuid() {
		return ownerUuid;
	}

	public int getGeneration() {
		return generation;
	}

	public void bind(UUID owner, int generation, boolean staying) {
		this.ownerUuid = owner;
		this.generation = generation;
		this.setStaying(staying);
		this.setPersistent();
	}

	@Nullable
	public ServerPlayerEntity getOwner() {
		if (ownerUuid == null || !(this.getEntityWorld() instanceof ServerWorld world)) return null;
		return world.getServer().getPlayerManager().getPlayer(ownerUuid);
	}

	// ---------------------------------------------------------------- persistence

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.putNullable("Owner", Uuids.CODEC, ownerUuid);
		view.putInt("Generation", generation);
		view.putBoolean("Staying", isStaying());
		if (anchor != null) view.put("Anchor", Vec3d.CODEC, anchor);
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.ownerUuid = view.read("Owner", Uuids.CODEC).orElse(null);
		this.generation = view.getInt("Generation", 0);
		this.dataTracker.set(STAYING, view.getBoolean("Staying", false));
		this.anchor = view.read("Anchor", Vec3d.CODEC).orElse(null);
	}

	// ---------------------------------------------------------------- physical behaviour

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean isCollidable(@Nullable net.minecraft.entity.Entity entity) {
		return false;
	}

	@Override
	public boolean canImmediatelyDespawn(double distanceSquared) {
		return false;
	}

	@Override
	public boolean canBeLeashed() {
		return false;
	}

	@Override
	protected void pushAway(net.minecraft.entity.Entity entity) {
	}

	@Override
	public boolean isInvulnerableTo(ServerWorld world, DamageSource source) {
		return !source.isIn(DamageTypeTags.BYPASSES_INVULNERABILITY);
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		if (source.isIn(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return super.damage(world, source, amount);
		}
		ServerPlayerEntity owner = getOwner();
		if (owner != null && source.getAttacker() == owner && this.hurtTime == 0) {
			this.hurtTime = 10;
			Bond bond = Bond.of(owner);
			bond.addTrust(-15);
			world.playSound(null, getX(), getY(), getZ(), SoundEvents.BLOCK_AMETHYST_BLOCK_BREAK, SoundCategory.NEUTRAL, 1.0f, 0.6f);
			world.spawnParticles(ParticleTypes.SMOKE, getX(), getY() + 0.25, getZ(), 12, 0.2, 0.2, 0.2, 0.02);
			refreshMood(owner, bond);
			say(owner, Dialogue.hurt(getRandom(), getMood()));
		}
		return false;
	}

	@Override
	public void tick() {
		this.noClip = true;
		this.setNoGravity(true);
		super.tick();
		World world = this.getEntityWorld();
		if (world.isClient()) {
			tickClientParticles(world);
		} else {
			tickServer((ServerWorld) world);
		}
	}

	@Override
	public void travel(Vec3d movementInput) {
		// Lumen steers itself by setting velocity directly; just integrate it with gentle drag.
		this.move(MovementType.SELF, this.getVelocity());
		this.setVelocity(this.getVelocity().multiply(0.82));
	}

	private void tickClientParticles(World world) {
		if (this.random.nextInt(6) == 0) {
			var particle = switch (getMood()) {
				case CALM -> ParticleTypes.END_ROD;
				case UNEASY -> ParticleTypes.SMALL_FLAME;
				case HOSTILE -> ParticleTypes.SMOKE;
			};
			world.addParticleClient(particle,
				getX() + (random.nextDouble() - 0.5) * 0.4,
				getY() + 0.2 + (random.nextDouble() - 0.5) * 0.4,
				getZ() + (random.nextDouble() - 0.5) * 0.4,
				0, -0.01, 0);
		}
	}

	private void tickServer(ServerWorld world) {
		if (ownerUuid == null) {
			// Unbound (e.g. from a spawn egg): drift lazily until someone claims it.
			if (this.age % 40 == 0) {
				setVelocity(getVelocity().add((random.nextDouble() - 0.5) * 0.1, (random.nextDouble() - 0.5) * 0.06, (random.nextDouble() - 0.5) * 0.1));
			}
			return;
		}

		ServerPlayerEntity owner = getOwner();
		if (owner == null) {
			// Owner offline. A following Lumen dissolves and re-manifests when they return.
			if (!isStaying() && ++ownerMissingTicks > 40) {
				this.discard();
			}
			hover(anchor != null ? anchor : getEntityPos());
			return;
		}
		ownerMissingTicks = 0;

		Bond bond = Bond.of(owner);
		if (!bond.bound || bond.generation != this.generation) {
			// A newer copy exists (or the bond was released): this one is stale.
			this.discard();
			return;
		}
		BondManager.track(owner.getUuid(), this);
		if (isStaying() != bond.staying) setStaying(bond.staying);
		refreshMood(owner, bond);

		if (isStaying() || owner.getEntityWorld() != world) {
			hover(anchor != null ? anchor : getEntityPos());
		} else {
			followOwner(owner);
		}

		tickBehaviour(world, owner, bond);
	}

	private void hover(Vec3d point) {
		double bob = Math.sin(this.age * 0.08) * 0.15;
		Vec3d target = point.add(0, bob, 0);
		steerTowards(target, 0.08);
	}

	private void followOwner(ServerPlayerEntity owner) {
		float yaw = owner.getYaw() * MathHelper.RADIANS_PER_DEGREE;
		// Hover over the owner's right shoulder, slightly behind them.
		double side = 0.85, back = 0.45;
		double ox = -MathHelper.sin(yaw) * -back + MathHelper.cos(yaw) * -side;
		double oz = MathHelper.cos(yaw) * -back + MathHelper.sin(yaw) * -side;
		double bob = Math.sin(this.age * 0.1) * 0.12;
		Vec3d target = new Vec3d(owner.getX() + ox, owner.getY() + owner.getStandingEyeHeight() + 0.35 + bob, owner.getZ() + oz);

		double distSq = this.squaredDistanceTo(target);
		if (distSq > 24 * 24) {
			this.refreshPositionAndAngles(target.x, target.y, target.z, getYaw(), getPitch());
			this.setVelocity(Vec3d.ZERO);
		} else {
			steerTowards(target, distSq > 16 ? 0.25 : 0.12);
		}
		lookAt(owner.getEyePos());
	}

	private void steerTowards(Vec3d target, double strength) {
		Vec3d delta = target.subtract(this.getEntityPos());
		Vec3d wanted = delta.multiply(strength);
		double max = 1.2;
		if (wanted.lengthSquared() > max * max) wanted = wanted.normalize().multiply(max);
		this.setVelocity(this.getVelocity().multiply(0.5).add(wanted));
	}

	private void lookAt(Vec3d point) {
		Vec3d d = point.subtract(this.getEyePos());
		float yaw = (float) (MathHelper.atan2(d.z, d.x) * MathHelper.DEGREES_PER_RADIAN) - 90.0f;
		float pitch = (float) -(MathHelper.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) * MathHelper.DEGREES_PER_RADIAN);
		this.setYaw(yaw);
		this.setHeadYaw(yaw);
		this.setBodyYaw(yaw);
		this.setPitch(pitch);
	}

	private void refreshMood(ServerPlayerEntity owner, Bond bond) {
		Bond.Mood mood = bond.mood(LumenConfig.get().hostilityThreshold);
		this.dataTracker.set(MOOD, mood.ordinal());
		if (mood != lastMood) {
			if (mood == Bond.Mood.HOSTILE) {
				say(owner, Dialogue.turnedHostile(getRandom()));
				getEntityWorld().playSound(null, getX(), getY(), getZ(), SoundEvents.ENTITY_WARDEN_HEARTBEAT, SoundCategory.HOSTILE, 1.5f, 0.6f);
			} else if (lastMood == Bond.Mood.HOSTILE) {
				say(owner, "...The dark is quieter now. I'll try again with you.");
			}
			lastMood = mood;
		}
	}

	private void tickBehaviour(ServerWorld world, ServerPlayerEntity owner, Bond bond) {
		LumenConfig config = LumenConfig.get();
		if (giftCooldown > 0) giftCooldown--;
		if (lowHealthCooldown > 0) lowHealthCooldown--;

		// Trust slowly heals when Lumen is merely resentful.
		if (++trustDriftTimer >= 1200) {
			trustDriftTimer = 0;
			if (bond.trust < 0 && bond.trust > config.hostilityThreshold) bond.addTrust(1);
			else if (bond.trust <= config.hostilityThreshold && random.nextInt(3) == 0) bond.addTrust(1);
		}

		boolean near = owner.getEntityWorld() == world && this.squaredDistanceTo(owner) < 32 * 32;

		if (near && getMood() != Bond.Mood.HOSTILE && lowHealthCooldown == 0 && owner.getHealth() <= 6.0f && !owner.isCreative() && owner.isAlive()) {
			lowHealthCooldown = 1200;
			say(owner, Dialogue.lowHealth(getRandom()));
		}

		if (near && config.ambientRemarkSeconds > 0 && --ambientCooldown <= 0) {
			int base = config.ambientRemarkSeconds * 20;
			ambientCooldown = base / 2 + random.nextInt(base + 1);
			if (!LumenBrain.isThinking(owner.getUuid())) LumenBrain.respond(owner, this, null);
		}

		if (near && getMood() == Bond.Mood.HOSTILE && this.age % 200 == 0 && random.nextInt(4) == 0) {
			tryUnleashHollow(owner, bond, false);
		}
	}

	// ---------------------------------------------------------------- speech & actions

	public static MutableText speechText(String name, Bond.Mood mood, String line) {
		Formatting color = switch (mood) {
			case CALM -> Formatting.AQUA;
			case UNEASY -> Formatting.GOLD;
			case HOSTILE -> Formatting.DARK_RED;
		};
		return Text.literal("[" + name + "] ").formatted(color, Formatting.BOLD)
			.append(Text.literal(line).formatted(mood == Bond.Mood.HOSTILE ? Formatting.RED : Formatting.WHITE).styled(s -> s.withBold(false)));
	}

	public void say(ServerPlayerEntity owner, String line) {
		if (line == null || line.isBlank()) return;
		// Make sure the colour/voice match the current trust even if the mood changed this tick.
		this.dataTracker.set(MOOD, Bond.of(owner).mood(LumenConfig.get().hostilityThreshold).ordinal());
		owner.sendMessage(speechText(Bond.of(owner).name, getMood(), line), false);
		speakAloud(owner, line);
		SoundEvent sound = getMood() == Bond.Mood.HOSTILE ? SoundEvents.BLOCK_SCULK_SHRIEKER_SHRIEK : SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME;
		float volume = getMood() == Bond.Mood.HOSTILE ? 0.35f : 1.0f;
		getEntityWorld().playSound(null, getX(), getY(), getZ(), sound, SoundCategory.NEUTRAL, volume, 0.9f + random.nextFloat() * 0.5f);
	}

	/** Lets clients voice the line (synthesised locally, so it works offline). */
	private void speakAloud(ServerPlayerEntity owner, String line) {
		VoicePackets.LumenSpeechS2C packet = new VoicePackets.LumenSpeechS2C(getId(), getMood().ordinal(), line);
		if (ServerPlayNetworking.canSend(owner, VoicePackets.LumenSpeechS2C.ID)) ServerPlayNetworking.send(owner, packet);
		if (LumenConfig.get().lumenVoiceHeardByOthers && getEntityWorld() instanceof ServerWorld world) {
			for (ServerPlayerEntity other : world.getPlayers()) {
				if (other != owner && other.squaredDistanceTo(this) < 24 * 24 && ServerPlayNetworking.canSend(other, VoicePackets.LumenSpeechS2C.ID)) {
					ServerPlayNetworking.send(other, packet);
				}
			}
		}
	}

	/** Applies a parsed reply: speaks it and carries out any control tags. */
	public void apply(ServerPlayerEntity owner, LumenBrain.Reply reply) {
		Bond bond = Bond.of(owner);
		if (reply.trustDelta() != 0) bond.addTrust(reply.trustDelta());
		refreshMood(owner, bond);
		say(owner, reply.text().isEmpty() ? "..." : reply.text());

		if (reply.stay() && !reply.follow()) {
			bond.staying = true;
			setStaying(true);
		} else if (reply.follow()) {
			bond.staying = false;
			setStaying(false);
		}
		if (reply.gift()) tryGift(owner, bond);
		if (reply.summon()) tryUnleashHollow(owner, bond, true);
	}

	private void tryGift(ServerPlayerEntity owner, Bond bond) {
		if (bond.trust < 30 || giftCooldown > 0) return;
		giftCooldown = 6000;
		List<ItemStack> gifts = List.of(
			new ItemStack(Items.GLOWSTONE_DUST, 4), new ItemStack(Items.AMETHYST_SHARD, 3), new ItemStack(Items.GLOW_BERRIES, 6),
			new ItemStack(Items.TORCH, 16), new ItemStack(Items.IRON_INGOT, 3), new ItemStack(Items.GOLDEN_CARROT, 4),
			new ItemStack(Items.ENDER_PEARL, 1), new ItemStack(Items.EXPERIENCE_BOTTLE, 3), new ItemStack(Items.DIAMOND, 1)
		);
		ItemStack gift = gifts.get(random.nextInt(bond.trust >= 70 ? gifts.size() : gifts.size() - 2)).copy();
		this.dropStack((ServerWorld) getEntityWorld(), gift, 0.2f);
		((ServerWorld) getEntityWorld()).spawnParticles(ParticleTypes.HAPPY_VILLAGER, getX(), getY() + 0.3, getZ(), 8, 0.3, 0.3, 0.3, 0.0);
		getEntityWorld().playSound(null, getX(), getY(), getZ(), SoundEvents.ENTITY_ALLAY_ITEM_THROWN, SoundCategory.NEUTRAL, 1.0f, 1.0f);
	}

	private void tryUnleashHollow(ServerPlayerEntity owner, Bond bond, boolean announced) {
		LumenConfig config = LumenConfig.get();
		ServerWorld world = (ServerWorld) getEntityWorld();
		if (!config.allowHollowSummons || bond.trust >= 0 || owner.isCreative() || owner.isSpectator()) return;
		if (owner.getEntityWorld() != world) return;
		long now = world.getServer().getTicks();
		if (now - bond.lastSummonTick < config.summonCooldownSeconds * 20L) return;

		BlockPos spawnPos = HollowEntity.findSpawnBehind(world, owner);
		if (spawnPos == null) return;
		HollowEntity hollow = LumenRegistry.HOLLOW.create(world, SpawnReason.EVENT);
		if (hollow == null) return;
		bond.lastSummonTick = now;
		hollow.refreshPositionAndAngles(spawnPos.getX() + 0.5, spawnPos.getY(), spawnPos.getZ() + 0.5, owner.getYaw(), 0);
		hollow.setSummoned(owner.getUuid(), config.hollowLifetimeSeconds * 20);
		world.spawnEntity(hollow);
		hollow.playSpawnEffects();
		if (!announced) say(owner, Dialogue.summon(getRandom()));
	}

	@Override
	protected ActionResult interactMob(PlayerEntity player, Hand hand) {
		if (!(player instanceof ServerPlayerEntity serverPlayer)) return ActionResult.SUCCESS;
		ItemStack stack = player.getStackInHand(hand);

		if (ownerUuid == null) {
			Bond bond = Bond.of(serverPlayer);
			if (bond.bound && BondManager.find(serverPlayer.getUuid()) != null) {
				serverPlayer.sendMessage(Text.translatable("message.lumen.already_bound").formatted(Formatting.GRAY), true);
				return ActionResult.FAIL;
			}
			BondManager.adopt(serverPlayer, this);
			return ActionResult.SUCCESS_SERVER;
		}
		if (!player.getUuid().equals(ownerUuid)) {
			serverPlayer.sendMessage(Text.translatable("message.lumen.not_yours").formatted(Formatting.GRAY), true);
			return ActionResult.FAIL;
		}

		Bond bond = Bond.of(serverPlayer);
		int value = giftValue(stack);
		if (value > 0) {
			stack.decrementUnlessCreative(1, player);
			bond.addTrust(value);
			refreshMood(serverPlayer, bond);
			((ServerWorld) getEntityWorld()).spawnParticles(ParticleTypes.HEART, getX(), getY() + 0.4, getZ(), 3, 0.2, 0.2, 0.2, 0.0);
			say(serverPlayer, value >= 20 ? "Oh... for me? Thank you. Truly." : "It's shiny. I like it.");
			return ActionResult.SUCCESS_SERVER;
		}

		if (player.isSneaking()) {
			bond.staying = !bond.staying;
			setStaying(bond.staying);
			say(serverPlayer, bond.staying ? "I'll wait here." : "Coming.");
			return ActionResult.SUCCESS_SERVER;
		}

		serverPlayer.sendMessage(Text.translatable("message.lumen.status", bond.name, bond.trust,
			Text.translatable("mood.lumen." + getMood().name().toLowerCase())).formatted(Formatting.GRAY), true);
		if (!LumenBrain.isThinking(serverPlayer.getUuid())) {
			LumenBrain.respond(serverPlayer, this, "(The player gently pokes you to get your attention.)");
		}
		return ActionResult.SUCCESS_SERVER;
	}

	private static int giftValue(ItemStack stack) {
		if (stack.isOf(LumenRegistry.HOLLOW_SHARD)) return 25;
		if (stack.isOf(Items.ENCHANTED_GOLDEN_APPLE)) return 50;
		if (stack.isOf(Items.GOLDEN_APPLE)) return 20;
		if (stack.isOf(Items.GLOWSTONE) || stack.isOf(Items.AMETHYST_BLOCK)) return 10;
		if (stack.isOf(Items.GLOWSTONE_DUST) || stack.isOf(Items.AMETHYST_SHARD) || stack.isOf(Items.GLOW_BERRIES)) return 4;
		if (stack.isOf(Items.GLOW_INK_SAC) || stack.isOf(Items.SEA_LANTERN)) return 6;
		if (stack.isIn(ItemTags.FLOWERS)) return 3;
		return 0;
	}

	@Override
	public void remove(RemovalReason reason) {
		super.remove(reason);
		if (ownerUuid != null) BondManager.untrack(ownerUuid, this);
	}

	@Override
	protected @Nullable SoundEvent getAmbientSound() {
		return null;
	}

	@Override
	protected @Nullable SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.BLOCK_AMETHYST_BLOCK_HIT;
	}

	@Override
	protected @Nullable SoundEvent getDeathSound() {
		return SoundEvents.BLOCK_AMETHYST_CLUSTER_BREAK;
	}
}
