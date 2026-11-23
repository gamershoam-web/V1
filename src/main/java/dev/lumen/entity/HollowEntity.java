package dev.lumen.entity;

import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.ai.goal.LookAroundGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.Uuids;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.UUID;

/**
 * The Hollow: a gaunt shadow that a betrayed Lumen calls up. It stalks its victim, slips behind
 * them when out of reach, and its touch brings darkness. Summoned Hollows fade after a while.
 */
public class HollowEntity extends HostileEntity {
	@Nullable
	private UUID victim;
	private int lifetime = -1;
	private int blinkCooldown = 100;

	public HollowEntity(EntityType<? extends HostileEntity> type, World world) {
		super(type, world);
		this.experiencePoints = 12;
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return HostileEntity.createHostileAttributes()
			.add(EntityAttributes.MAX_HEALTH, 40.0)
			.add(EntityAttributes.ATTACK_DAMAGE, 6.0)
			.add(EntityAttributes.MOVEMENT_SPEED, 0.31)
			.add(EntityAttributes.FOLLOW_RANGE, 48.0)
			.add(EntityAttributes.ARMOR, 4.0)
			.add(EntityAttributes.KNOCKBACK_RESISTANCE, 0.5)
			.add(EntityAttributes.STEP_HEIGHT, 1.0);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.15, false));
		this.goalSelector.add(7, new WanderAroundFarGoal(this, 0.8));
		this.goalSelector.add(8, new LookAtEntityGoal(this, PlayerEntity.class, 16.0f));
		this.goalSelector.add(8, new LookAroundGoal(this));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, false,
			(target, world) -> victim == null || target.getUuid().equals(victim)));
	}

	public void setSummoned(UUID victim, int lifetimeTicks) {
		this.victim = victim;
		this.lifetime = lifetimeTicks;
		this.setPersistent();
	}

	public boolean isAttacking() {
		return this.getTarget() != null;
	}

	/** Finds a dark-ish standing spot a few blocks behind the player, or null. */
	@Nullable
	public static BlockPos findSpawnBehind(ServerWorld world, ServerPlayerEntity player) {
		float yaw = player.getYaw() * MathHelper.RADIANS_PER_DEGREE;
		Vec3d back = new Vec3d(MathHelper.sin(yaw), 0, -MathHelper.cos(yaw));
		for (int attempt = 0; attempt < 16; attempt++) {
			double dist = 4 + world.random.nextInt(4);
			double spread = (world.random.nextDouble() - 0.5) * 4;
			BlockPos base = BlockPos.ofFloored(player.getX() + back.x * dist + back.z * spread, player.getY(), player.getZ() + back.z * dist - back.x * spread);
			for (int dy = 3; dy >= -3; dy--) {
				BlockPos pos = base.up(dy);
				if (canStand(world, pos)) return pos;
			}
		}
		return null;
	}

	private static boolean canStand(ServerWorld world, BlockPos pos) {
		BlockState below = world.getBlockState(pos.down());
		return below.isSolidBlock(world, pos.down())
			&& world.getBlockState(pos).getCollisionShape(world, pos).isEmpty()
			&& world.getBlockState(pos.up()).getCollisionShape(world, pos.up()).isEmpty()
			&& world.getBlockState(pos.up(2)).getCollisionShape(world, pos.up(2)).isEmpty()
			&& world.getFluidState(pos).isEmpty();
	}

	@Override
	public void tick() {
		super.tick();
		if (!(this.getEntityWorld() instanceof ServerWorld world)) {
			if (this.random.nextInt(3) == 0) {
				this.getEntityWorld().addParticleClient(ParticleTypes.SMOKE,
					getParticleX(0.5), getRandomBodyY(), getParticleZ(0.5), 0, 0.02, 0);
			}
			return;
		}
		if (lifetime > 0 && --lifetime == 0) {
			fadeAway(world);
			return;
		}
		if (blinkCooldown > 0) blinkCooldown--;
		LivingEntity target = getTarget();
		if (target instanceof ServerPlayerEntity player && blinkCooldown == 0) {
			double distSq = squaredDistanceTo(player);
			if (distSq > 10 * 10 || (distSq > 4 * 4 && !canSee(player))) {
				BlockPos pos = findSpawnBehind(world, player);
				if (pos != null) {
					blinkCooldown = 160 + random.nextInt(80);
					world.spawnParticles(ParticleTypes.LARGE_SMOKE, getX(), getBodyY(0.5), getZ(), 20, 0.3, 0.8, 0.3, 0.02);
					requestTeleport(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5);
					world.playSound(null, getX(), getY(), getZ(), SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.HOSTILE, 1.0f, 0.5f);
					world.spawnParticles(ParticleTypes.SCULK_SOUL, getX(), getBodyY(0.5), getZ(), 12, 0.3, 0.8, 0.3, 0.02);
				}
			}
		}
		if (victim != null && this.age % 20 == 0) {
			ServerPlayerEntity player = world.getServer().getPlayerManager().getPlayer(victim);
			if (player == null || player.getEntityWorld() != world || player.isCreative() || player.isSpectator()) {
				fadeAway(world);
			} else if (getTarget() == null) {
				setTarget(player);
			}
		}
	}

	private void fadeAway(ServerWorld world) {
		world.spawnParticles(ParticleTypes.LARGE_SMOKE, getX(), getBodyY(0.5), getZ(), 30, 0.3, 0.9, 0.3, 0.03);
		world.playSound(null, getX(), getY(), getZ(), SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.HOSTILE, 0.8f, 0.4f);
		this.discard();
	}

	@Override
	public boolean tryAttack(ServerWorld world, Entity target) {
		boolean hit = super.tryAttack(world, target);
		if (hit && target instanceof LivingEntity living) {
			living.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 140, 0), this);
			living.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOWNESS, 40, 0), this);
		}
		return hit;
	}

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.putNullable("Victim", Uuids.CODEC, victim);
		view.putInt("Lifetime", lifetime);
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.victim = view.read("Victim", Uuids.CODEC).orElse(null);
		this.lifetime = view.getInt("Lifetime", -1);
	}

	@Override
	public float getSoundPitch() {
		return 0.45f + this.random.nextFloat() * 0.15f;
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.ENTITY_ENDERMAN_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.ENTITY_ENDERMAN_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.ENTITY_ENDERMAN_DEATH;
	}
}
