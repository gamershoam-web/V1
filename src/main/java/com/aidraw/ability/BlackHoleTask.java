package com.aidraw.ability;

import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Sucks every entity nearby into a point and crushes them. Doesn't pull its creator. */
public class BlackHoleTask implements ServerTasks.Task {
    private final ServerLevel level;
    private final Vec3 center;
    private final Player owner;
    private final double range;
    private final int duration;
    private final float damage;
    private int age;

    public BlackHoleTask(ServerLevel level, Vec3 center, Player owner, int strength) {
        this.level = level;
        this.center = center.add(0, 1.5, 0);
        this.owner = owner;
        this.range = 5 + strength * 1.5;
        this.duration = 40 + strength * 12;
        this.damage = 1 + strength * 0.4F;
    }

    @Override
    public boolean tick() {
        age++;
        level.sendParticles(ParticleTypes.REVERSE_PORTAL, true, false, center.x, center.y, center.z, 30, range * 0.3, range * 0.3, range * 0.3, 0.2);
        level.sendParticles(ParticleTypes.SQUID_INK, center.x, center.y, center.z, 6, 0.3, 0.3, 0.3, 0.0);
        if (age % 20 == 1) level.playSound(null, center.x, center.y, center.z, SoundEvents.PORTAL_AMBIENT, SoundSource.HOSTILE, 3.0F, 0.5F);
        for (Entity e : level.getEntities(owner, new AABB(center, center).inflate(range), Entity::isAlive)) {
            Vec3 toCenter = center.subtract(e.position());
            double d = toCenter.length();
            if (d > range || d < 0.01) continue;
            e.setDeltaMovement(e.getDeltaMovement().scale(0.6).add(toCenter.normalize().scale(0.25 + 0.6 * (1 - d / range))));
            e.hurtMarked = true;
            if (d < 2.0 && age % 5 == 0 && e instanceof LivingEntity living) {
                living.hurtServer(level, level.damageSources().magic(), damage * 3);
            }
        }
        if (age >= duration) {
            level.explode(owner, center.x, center.y, center.z, 3.0F, net.minecraft.world.level.Level.ExplosionInteraction.NONE);
            return true;
        }
        return false;
    }
}
