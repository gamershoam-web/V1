package com.aidraw.ability;

import com.aidraw.ai.AiConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.entity.projectile.hurtingprojectile.LargeFireball;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/** Executes abilities. All methods run on the server thread. */
public final class AbilityRunner {
    private static final Set<String> BOSSES = Set.of("minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", "minecraft:elder_guardian");

    /** Where the player is aiming: the entity or block they look at, up to {@code range} blocks. */
    public record Target(Vec3 pos, LivingEntity entity) {}

    public static Target aim(ServerPlayer player, double range) {
        Vec3 eye = player.getEyePosition();
        Vec3 end = eye.add(player.getLookAngle().scale(range));
        BlockHitResult block = player.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
        Vec3 blockEnd = block.getType() == HitResult.Type.MISS ? end : block.getLocation();
        EntityHitResult ent = ProjectileUtil.getEntityHitResult(player, eye, blockEnd,
                player.getBoundingBox().expandTowards(blockEnd.subtract(eye)).inflate(1.0),
                e -> e instanceof LivingEntity && e.isAlive() && !e.isSpectator(), eye.distanceToSqr(blockEnd));
        if (ent != null && ent.getEntity() instanceof LivingEntity le) return new Target(le.position(), le);
        return new Target(blockEnd, null);
    }

    public static void runAll(ServerPlayer player, ItemStack stack, List<ItemSpec.Ability> abilities, Target target, boolean fromHit) {
        for (ItemSpec.Ability a : abilities) {
            try {
                run(player, stack, a, target, fromHit);
            } catch (Exception e) {
                com.aidraw.AiDrawMod.LOGGER.error("Ability {} failed", a.type(), e);
            }
        }
    }

    public static void run(ServerPlayer player, ItemStack stack, ItemSpec.Ability a, Target t, boolean fromHit) {
        ServerLevel level = (ServerLevel) player.level();
        AiConfig cfg = AiConfig.get();
        RandomSource rnd = level.getRandom();
        int s = a.strength();
        Vec3 p = t.pos();
        Level.ExplosionInteraction blocks = cfg.blockDamage ? Level.ExplosionInteraction.TNT : Level.ExplosionInteraction.NONE;

        switch (a.type()) {
            case EXPLOSION -> level.explode(player, p.x, p.y, p.z, 1.0F + s * 0.9F, blocks);

            case NUKE -> {
                if (!cfg.allowNukes) {
                    level.explode(player, p.x, p.y, p.z, 8.0F, blocks);
                    return;
                }
                int radius = Math.max(8, (int) Math.round(cfg.maxNukeRadius * s / 10.0));
                ServerTasks.add(new NukeTask(level, p, radius, player, cfg.blockDamage));
            }

            case LIGHTNING -> {
                int bolts = Math.max(1, s);
                double spread = t.entity() != null && bolts == 1 ? 0 : s * 0.7;
                for (int i = 0; i < bolts; i++) {
                    double ox = i == 0 ? 0 : (rnd.nextDouble() - 0.5) * 2 * spread;
                    double oz = i == 0 ? 0 : (rnd.nextDouble() - 0.5) * 2 * spread;
                    ServerTasks.later(1 + i * 3, () -> {
                        LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.TRIGGERED);
                        if (bolt == null) return;
                        BlockPos ground = level.getHeightmapPos(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING, BlockPos.containing(p.x + ox, p.y, p.z + oz));
                        bolt.setPos(p.x + ox, Math.min(ground.getY(), p.y + 1) , p.z + oz);
                        bolt.setCause(player);
                        level.addFreshEntity(bolt);
                    });
                }
            }

            case FIRE -> {
                int r = 1 + s / 2;
                BlockPos c = BlockPos.containing(p);
                for (BlockPos bp : BlockPos.betweenClosed(c.offset(-r, -2, -r), c.offset(r, 2, r))) {
                    if (bp.distSqr(c) > r * r || rnd.nextFloat() > 0.5) continue;
                    if (level.getBlockState(bp).isAir() && level.getBlockState(bp.below()).isFaceSturdy(level, bp.below(), net.minecraft.core.Direction.UP)) {
                        level.setBlockAndUpdate(bp, Blocks.FIRE.defaultBlockState());
                    }
                }
                for (LivingEntity e : around(level, p, 2 + s * 0.8, player)) e.igniteForSeconds(2 + s * 1.5F);
                level.sendParticles(ParticleTypes.FLAME, p.x, p.y + 1, p.z, 40 + s * 10, r, 1, r, 0.05);
                level.playSound(null, p.x, p.y, p.z, SoundEvents.BLAZE_SHOOT, SoundSource.PLAYERS, 1.5F, 0.8F);
            }

            case SHOOT_ARROW -> {
                int count = 1 + s / 4;
                for (int i = 0; i < count; i++) {
                    Arrow bullet = new Arrow(level, player, new ItemStack(Items.ARROW), stack.isEmpty() ? null : stack);
                    bullet.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0F, 4.0F + s * 0.2F, count > 1 ? 3.0F : 0.3F);
                    bullet.setBaseDamage(1.0 + s * 0.7);
                    bullet.pickup = AbstractArrow.Pickup.CREATIVE_ONLY;
                    bullet.setNoGravity(true);
                    if (s >= 7) bullet.igniteForSeconds(100);
                    level.addFreshEntity(bullet);
                }
                level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.FIREWORK_ROCKET_BLAST, SoundSource.PLAYERS, 1.0F, 1.6F);
            }

            case SHOOT_FIREBALL -> {
                Vec3 look = player.getLookAngle();
                int count = 1 + (s >= 8 ? 2 : 0);
                for (int i = 0; i < count; i++) {
                    Vec3 dir = look.add((rnd.nextDouble() - 0.5) * 0.15 * i, (rnd.nextDouble() - 0.5) * 0.15 * i, (rnd.nextDouble() - 0.5) * 0.15 * i);
                    LargeFireball fb = new LargeFireball(level, player, dir.normalize(), cfg.blockDamage ? Math.max(1, s / 2) : 0);
                    fb.setPos(player.getX() + look.x * 1.5, player.getEyeY() + look.y * 1.5, player.getZ() + look.z * 1.5);
                    level.addFreshEntity(fb);
                }
                level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.GHAST_SHOOT, SoundSource.PLAYERS, 1.0F, 1.0F);
            }

            case BEAM -> {
                Vec3 eye = player.getEyePosition();
                Vec3 dir = player.getLookAngle();
                double len = 20 + s * 8;
                BlockHitResult hit = level.clip(new ClipContext(eye, eye.add(dir.scale(len)), ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
                Vec3 end = hit.getType() == HitResult.Type.MISS ? eye.add(dir.scale(len)) : hit.getLocation();
                double dist = eye.distanceTo(end);
                for (double d = 1; d < dist; d += 0.5) {
                    Vec3 pt = eye.add(dir.scale(d));
                    level.sendParticles(s >= 7 ? ParticleTypes.SOUL_FIRE_FLAME : ParticleTypes.END_ROD, true, false, pt.x, pt.y, pt.z, 1, 0, 0, 0, 0);
                }
                AABB box = new AABB(eye, end).inflate(1.0);
                for (Entity e : level.getEntities(player, box, x -> x instanceof LivingEntity && x.isAlive())) {
                    if (e.getBoundingBox().inflate(0.6).clip(eye, end).isPresent()) {
                        ((LivingEntity) e).hurtServer(level, level.damageSources().indirectMagic(player, player), 3 + s * 1.8F);
                        if (s >= 6) e.igniteForSeconds(3);
                    }
                }
                if (s >= 9 && hit.getType() != HitResult.Type.MISS) level.explode(player, end.x, end.y, end.z, 2.0F, blocks);
                level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BEACON_ACTIVATE, SoundSource.PLAYERS, 1.0F, 2.0F);
            }

            case METEOR_SHOWER -> {
                int count = 3 + s * 2;
                double area = 4 + s * 1.2;
                for (int i = 0; i < count; i++) {
                    double ox = (rnd.nextDouble() - 0.5) * 2 * area, oz = (rnd.nextDouble() - 0.5) * 2 * area;
                    ServerTasks.later(i * 4 + 1, () -> {
                        LargeFireball m = new LargeFireball(level, player, new Vec3(0, -1, 0), cfg.blockDamage ? 1 + s / 3 : 0);
                        m.setPos(p.x + ox, p.y + 40, p.z + oz);
                        m.setDeltaMovement(0, -1.5, 0);
                        level.addFreshEntity(m);
                    });
                }
                level.playSound(null, p.x, p.y, p.z, SoundEvents.WITHER_SPAWN, SoundSource.HOSTILE, 2.0F, 1.5F);
            }

            case SHOCKWAVE -> {
                Vec3 c = fromHit ? player.position() : player.position();
                double r = 3 + s * 0.9;
                for (LivingEntity e : around(level, c, r, player)) {
                    Vec3 away = e.position().subtract(c).normalize();
                    e.hurtServer(level, level.damageSources().playerAttack(player), 2 + s * 1.3F);
                    e.setDeltaMovement(away.scale(0.8 + s * 0.35).add(0, 0.4 + s * 0.08, 0));
                    e.hurtMarked = true;
                }
                for (int i = 0; i < 36; i++) {
                    double ang = Math.PI * 2 * i / 36;
                    level.sendParticles(ParticleTypes.SONIC_BOOM, c.x + Math.cos(ang) * r * 0.6, c.y + 0.5, c.z + Math.sin(ang) * r * 0.6, 1, 0, 0, 0, 0);
                }
                level.playSound(null, c.x, c.y, c.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.5F, 1.0F);
            }

            case DASH -> {
                player.setDeltaMovement(player.getLookAngle().scale(1.0 + s * 0.3).add(0, 0.2, 0));
                player.hurtMarked = true;
                ServerTasks.noFall(player, 60);
                level.sendParticles(ParticleTypes.CLOUD, player.getX(), player.getY(), player.getZ(), 15, 0.3, 0.2, 0.3, 0.05);
                level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BREEZE_JUMP, SoundSource.PLAYERS, 1.0F, 1.0F);
            }

            case LAUNCH_UP -> {
                player.setDeltaMovement(player.getDeltaMovement().x, 0.8 + s * 0.3, player.getDeltaMovement().z);
                player.hurtMarked = true;
                ServerTasks.noFall(player, 100);
                level.sendParticles(ParticleTypes.EXPLOSION, player.getX(), player.getY(), player.getZ(), 3, 0.3, 0.1, 0.3, 0);
                level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.WIND_CHARGE_BURST.value(), SoundSource.PLAYERS, 1.0F, 1.0F);
            }

            case TELEPORT -> {
                if (fromHit) return;
                Target far = aim(player, 16 + s * 8);
                Vec3 dest = far.pos().subtract(player.getLookAngle().scale(0.8));
                level.sendParticles(ParticleTypes.PORTAL, player.getX(), player.getY() + 1, player.getZ(), 40, 0.4, 0.8, 0.4, 0.3);
                player.teleportTo(dest.x, dest.y, dest.z);
                ServerTasks.noFall(player, 60);
                level.playSound(null, dest.x, dest.y, dest.z, SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 1.0F, 1.0F);
            }

            case FLY -> {} // handled by DrawnItem while holding right-click

            case FREEZE -> {
                double r = 2 + s * 0.7;
                for (LivingEntity e : around(level, p, r, player)) {
                    e.setTicksFrozen(140 + s * 30);
                    e.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 40 + s * 20, Math.min(6, s / 2)), player);
                    e.hurtServer(level, level.damageSources().freeze(), 1 + s * 0.6F);
                }
                BlockPos c = BlockPos.containing(p);
                int ri = (int) Math.ceil(r);
                for (BlockPos bp : BlockPos.betweenClosed(c.offset(-ri, -2, -ri), c.offset(ri, 2, ri))) {
                    if (bp.distSqr(c) > r * r) continue;
                    BlockState st = level.getBlockState(bp);
                    if (st.is(Blocks.WATER)) level.setBlockAndUpdate(bp, Blocks.ICE.defaultBlockState());
                    else if (st.is(Blocks.LAVA)) level.setBlockAndUpdate(bp, Blocks.OBSIDIAN.defaultBlockState());
                    else if (st.is(Blocks.FIRE)) level.removeBlock(bp, false);
                }
                level.sendParticles(ParticleTypes.SNOWFLAKE, p.x, p.y + 1, p.z, 60 + s * 10, r * 0.5, 1, r * 0.5, 0.05);
                level.playSound(null, p.x, p.y, p.z, SoundEvents.GLASS_BREAK, SoundSource.PLAYERS, 1.5F, 0.6F);
            }

            case BLACK_HOLE -> ServerTasks.add(new BlackHoleTask(level, p, player, s));

            case SUMMON -> {
                Identifier id = Identifier.tryParse(a.entityId());
                if (id == null) return;
                if (!cfg.allowBossMobs && BOSSES.contains(id.toString())) return;
                Optional<EntityType<?>> type = BuiltInRegistries.ENTITY_TYPE.getOptional(id);
                if (type.isEmpty() || !type.get().canSummon() || type.get() == EntityType.PLAYER) return;
                int count = Math.min(4, 1 + s / 3);
                for (int i = 0; i < count; i++) {
                    BlockPos at = BlockPos.containing(p.x + rnd.nextInt(5) - 2, p.y, p.z + rnd.nextInt(5) - 2);
                    Entity e = type.get().spawn(level, at, EntitySpawnReason.MOB_SUMMONED);
                    if (e instanceof TamableAnimal pet) pet.tame(player);
                }
                level.sendParticles(ParticleTypes.HAPPY_VILLAGER, p.x, p.y + 1, p.z, 30, 1.5, 1, 1.5, 0);
            }

            case HEAL -> {
                player.heal(2.0F * s);
                level.sendParticles(ParticleTypes.HEART, player.getX(), player.getY() + 1.5, player.getZ(), 5 + s, 0.5, 0.4, 0.5, 0);
            }

            case EFFECT_SELF -> effect(a.effectId()).ifPresent(eff ->
                    player.addEffect(new MobEffectInstance(eff, 20 * (10 + s * 6), Math.min(4, (s - 1) / 3))));

            case EFFECT_AREA -> {
                Optional<Holder<MobEffect>> eff = effect(a.effectId());
                if (eff.isEmpty()) return;
                if (fromHit && t.entity() != null) {
                    t.entity().addEffect(new MobEffectInstance(eff.get(), 20 * (3 + s), Math.min(4, (s - 1) / 3)), player);
                    return;
                }
                for (LivingEntity e : around(level, p, 3 + s * 0.6, player)) {
                    e.addEffect(new MobEffectInstance(eff.get(), 20 * (5 + s * 2), Math.min(4, (s - 1) / 3)), player);
                }
                level.sendParticles(ParticleTypes.WITCH, p.x, p.y + 1, p.z, 40, 2, 1, 2, 0);
            }

            case KNOCKBACK -> {
                LivingEntity e = t.entity();
                if (e == null) return;
                Vec3 away = e.position().subtract(player.position()).normalize();
                e.setDeltaMovement(away.scale(0.6 + s * 0.45).add(0, 0.3 + s * 0.06, 0));
                e.hurtMarked = true;
            }

            case LIFESTEAL -> {
                if (t.entity() == null) return;
                player.heal(0.5F + s * 0.4F);
            }
        }
    }

    static Optional<Holder<MobEffect>> effect(String id) {
        Identifier rl = Identifier.tryParse(id == null ? "" : id);
        if (rl == null) return Optional.empty();
        return BuiltInRegistries.MOB_EFFECT.get(rl).map(h -> (Holder<MobEffect>) h);
    }

    private static List<LivingEntity> around(ServerLevel level, Vec3 c, double r, Entity except) {
        return level.getEntitiesOfClass(LivingEntity.class, new AABB(c, c).inflate(r),
                e -> e != except && e.isAlive() && !e.isSpectator() && e.position().distanceTo(c) <= r);
    }

    private AbilityRunner() {}
}
