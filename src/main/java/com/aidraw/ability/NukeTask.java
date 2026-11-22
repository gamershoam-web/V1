package com.aidraw.ability;

import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * A real nuke: 3s countdown, blinding flash, shockwave that hurts and throws everything in range,
 * a carved-out spherical crater with scorched rim and fires, and a mushroom cloud.
 * Blocks are removed in batches over several ticks so the server doesn't freeze.
 */
public class NukeTask implements ServerTasks.Task {
    private static final int FUSE = 60;
    private static final int BLOCKS_PER_TICK = 15000;
    private static final int CLOUD_TICKS = 160;

    private final ServerLevel level;
    private final Vec3 center;
    private final BlockPos c;
    private final int radius;
    private final Entity source;
    private final boolean blockDamage;
    private final RandomSource random;
    private final int span;
    private long cursor;
    private final long total;
    private int age;
    private int cloudAge = -1;

    public NukeTask(ServerLevel level, Vec3 center, int radius, Entity source, boolean blockDamage) {
        this.level = level;
        this.center = center;
        this.c = BlockPos.containing(center);
        this.radius = radius;
        this.source = source;
        this.blockDamage = blockDamage;
        this.random = level.getRandom();
        this.span = radius + 3;
        long side = 2L * span + 1;
        this.total = side * side * side;
    }

    @Override
    public boolean tick() {
        age++;
        if (age < FUSE) {
            if (age == 1) {
                for (ServerPlayer p : level.players()) {
                    if (p.position().distanceTo(center) < radius * 6 + 100) {
                        p.sendSystemMessage(Component.literal("☢ NUCLEAR DETONATION IN 3 SECONDS ☢").withStyle(ChatFormatting.RED, ChatFormatting.BOLD));
                    }
                }
            }
            if (age % 10 == 0) {
                level.playSound(null, center.x, center.y, center.z, SoundEvents.NOTE_BLOCK_PLING.value(), SoundSource.BLOCKS, 4.0F, 0.5F + age / 60.0F);
            }
            level.sendParticles(ParticleTypes.FLAME, center.x, center.y + 0.5, center.z, 4, 0.3, 0.3, 0.3, 0.02);
            return false;
        }
        if (age == FUSE) detonate();
        if (blockDamage && cursor < total) carve();
        if (cloudAge >= 0) cloud();
        return (!blockDamage || cursor >= total) && cloudAge > CLOUD_TICKS;
    }

    private void detonate() {
        cloudAge = 0;
        for (int i = 0; i < 6; i++) {
            level.playSound(null, center.x, center.y, center.z, SoundEvents.GENERIC_EXPLODE.value(), SoundSource.BLOCKS, 30.0F, 0.4F + i * 0.05F);
        }
        level.playSound(null, center.x, center.y, center.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.WEATHER, 30.0F, 0.5F);
        level.sendParticles(ParticleTypes.EXPLOSION_EMITTER, true, true, center.x, center.y, center.z, 40, radius * 0.4, radius * 0.3, radius * 0.4, 0.0);
        level.sendParticles(ParticleTypes.END_ROD, true, true, center.x, center.y + 2, center.z, 400, 1, 1, 1, 1.5); // blinding flash burst

        double reach = radius * 1.8;
        AABB box = new AABB(center, center).inflate(reach);
        for (Entity e : level.getEntities((Entity) null, box, Entity::isAlive)) {
            double d = e.position().distanceTo(center);
            if (d > reach) continue;
            double f = 1.0 - d / reach;
            if (e instanceof LivingEntity living) {
                living.hurtServer(level, level.damageSources().explosion(source, source), (float) (20 + 300 * f));
                living.igniteForSeconds((float) (10 * f + 2));
            }
            Vec3 push = e.position().subtract(center).normalize().scale(1.5 + 4 * f).add(0, 0.8 + f, 0);
            e.setDeltaMovement(e.getDeltaMovement().add(push));
            e.hurtMarked = true;
        }
    }

    private void carve() {
        int side = 2 * span + 1;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int done = 0;
        double r2 = (double) radius * radius;
        double rim2 = (radius + 2.5) * (radius + 2.5);
        while (cursor < total && done < BLOCKS_PER_TICK) {
            long i = cursor++;
            int dx = (int) (i % side) - span;
            int dz = (int) ((i / side) % side) - span;
            int dy = span - (int) (i / ((long) side * side)); // top to bottom
            double d2 = dx * dx + dy * dy * 1.3 + dz * dz; // slightly flattened sphere
            if (d2 > rim2) continue;
            done++;
            pos.set(c.getX() + dx, c.getY() + dy, c.getZ() + dz);
            if (!level.isLoaded(pos) || level.isOutsideBuildHeight(pos)) continue;
            BlockState state = level.getBlockState(pos);
            if (state.isAir() || state.getDestroySpeed(level, pos) < 0) continue;
            double edge = r2 * (0.88 + random.nextDouble() * 0.12);
            if (d2 <= edge) {
                level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
            } else if (state.isSolidRender()) {
                // scorched rim
                float roll = random.nextFloat();
                BlockState scorched = roll < 0.45 ? Blocks.BLACKSTONE.defaultBlockState()
                        : roll < 0.7 ? Blocks.COARSE_DIRT.defaultBlockState()
                        : roll < 0.8 ? Blocks.MAGMA_BLOCK.defaultBlockState() : state;
                level.setBlock(pos, scorched, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
                BlockPos up = pos.above();
                if (random.nextFloat() < 0.15 && level.getBlockState(up).isAir()) {
                    level.setBlock(up, Blocks.FIRE.defaultBlockState(), Block.UPDATE_ALL);
                }
            }
        }
    }

    private void cloud() {
        cloudAge++;
        double h = Math.min(1.0, cloudAge / 80.0) * (radius * 1.6 + 20);
        // stem
        level.sendParticles(ParticleTypes.CAMPFIRE_SIGNAL_SMOKE, true, true, center.x, center.y + h * 0.5, center.z, 12, radius * 0.08, h * 0.25, radius * 0.08, 0.02);
        // cap
        level.sendParticles(ParticleTypes.CAMPFIRE_SIGNAL_SMOKE, true, true, center.x, center.y + h, center.z, 25, radius * 0.4, radius * 0.12, radius * 0.4, 0.03);
        if (cloudAge < 40) {
            level.sendParticles(ParticleTypes.LAVA, true, true, center.x, center.y + 2, center.z, 20, radius * 0.4, 2, radius * 0.4, 0.5);
            level.sendParticles(ParticleTypes.EXPLOSION_EMITTER, true, true, center.x, center.y + h, center.z, 2, radius * 0.3, 2, radius * 0.3, 0);
        }
    }
}
