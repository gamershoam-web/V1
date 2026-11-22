package com.aidraw.item;

import com.aidraw.ability.AbilityRunner;
import com.aidraw.ability.ItemSpec;
import com.aidraw.ability.ServerTasks;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Every item made from a drawing. Its powers are not hard-coded: they come from the {@link ItemSpec}
 * that Claude designed for this particular drawing, stored on the stack.
 */
public class DrawnItem extends Item {
    private static final Map<UUID, Long> HEAVY_HIT_COOLDOWN = new ConcurrentHashMap<>();

    public DrawnItem(Properties properties) { super(properties); }

    public static ItemSpec spec(ItemStack stack) {
        CustomData data = stack.get(DataComponents.CUSTOM_DATA);
        if (data == null) return ItemSpec.EMPTY;
        return ItemSpec.fromJson(data.copyTag().getStringOr("spec", ""));
    }

    // ---------- right-click ----------

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.has(DataComponents.FOOD)) return super.use(level, player, hand); // eat it
        ItemSpec spec = spec(stack);
        if (spec.flies()) {
            player.startUsingItem(hand);
            return InteractionResult.CONSUME;
        }
        if (spec.use().isEmpty()) return InteractionResult.PASS;
        if (player instanceof ServerPlayer sp) {
            AbilityRunner.runAll(sp, stack, spec.use(), AbilityRunner.aim(sp, 100), false);
            if (spec.consumable()) stack.consume(1, player);
        }
        player.getCooldowns().addCooldown(stack, spec.cooldownTicks());
        return InteractionResult.SUCCESS;
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity entity) {
        if (stack.has(DataComponents.FOOD)) return super.getUseDuration(stack, entity);
        return spec(stack).flies() ? 72000 : 0;
    }

    @Override
    public ItemUseAnimation getUseAnimation(ItemStack stack) {
        if (stack.has(DataComponents.FOOD)) return super.getUseAnimation(stack);
        return spec(stack).flies() ? ItemUseAnimation.SPEAR : ItemUseAnimation.NONE;
    }

    @Override
    public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remaining) {
        ItemSpec spec = spec(stack);
        if (!spec.flies()) { super.onUseTick(level, entity, stack, remaining); return; }
        double speed = 0.4 + spec.flySpeed() * 0.15;
        Vec3 look = entity.getLookAngle();
        entity.setDeltaMovement(look.scale(speed)); // client applies this for the local player
        entity.resetFallDistance();
        if (level instanceof ServerLevel server && entity instanceof ServerPlayer sp) {
            ServerTasks.noFall(sp, 100);
            server.sendParticles(ParticleTypes.CLOUD, entity.getX(), entity.getY() + 0.3, entity.getZ(), 1, 0.2, 0.1, 0.2, 0.0);
            // Other "use" powers fire while flying too (e.g. a fighter jet that shoots), on cooldown.
            if (spec.use().size() > 1 && !sp.getCooldowns().isOnCooldown(stack)) {
                var others = spec.use().stream().filter(a -> a.type() != com.aidraw.ability.AbilityType.FLY).toList();
                AbilityRunner.runAll(sp, stack, others, AbilityRunner.aim(sp, 100), false);
                sp.getCooldowns().addCooldown(stack, Math.max(10, spec.cooldownTicks()));
            }
        }
    }

    // ---------- eating (food drawings) ----------

    @Override
    public ItemStack finishUsingItem(ItemStack stack, Level level, LivingEntity entity) {
        ItemSpec spec = spec(stack);
        if (entity instanceof ServerPlayer sp && stack.has(DataComponents.FOOD)) {
            for (ItemSpec.Passive p : spec.passive()) {
                effect(p.effectId()).ifPresent(e -> sp.addEffect(new MobEffectInstance(e, 20 * 60, p.amplifier())));
            }
            AbilityRunner.runAll(sp, stack, spec.use(), new AbilityRunner.Target(sp.position(), null), false);
        }
        return super.finishUsingItem(stack, level, entity);
    }

    // ---------- melee ----------

    @Override
    public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        super.hurtEnemy(stack, target, attacker);
        if (!(attacker instanceof ServerPlayer sp)) return;
        ItemSpec spec = spec(stack);
        if (spec.hit().isEmpty()) return;
        long now = sp.level().getGameTime();
        boolean heavyReady = now >= HEAVY_HIT_COOLDOWN.getOrDefault(sp.getUUID(), 0L);
        var abilities = spec.hit().stream().filter(a -> heavyReady || !a.type().heavy()).toList();
        if (heavyReady && spec.hit().stream().anyMatch(a -> a.type().heavy())) {
            HEAVY_HIT_COOLDOWN.put(sp.getUUID(), now + 100);
        }
        AbilityRunner.runAll(sp, stack, abilities, new AbilityRunner.Target(target.position(), target), true);
    }

    // ---------- passive powers while held ----------

    @Override
    public void inventoryTick(ItemStack stack, ServerLevel level, Entity entity, EquipmentSlot slot) {
        if (slot != EquipmentSlot.MAINHAND && slot != EquipmentSlot.OFFHAND) return;
        if (!(entity instanceof Player player) || stack.has(DataComponents.FOOD)) return;
        if (level.getGameTime() % 20 != 0) return;
        for (ItemSpec.Passive p : spec(stack).passive()) {
            effect(p.effectId()).ifPresent(e -> {
                int duration = e.value() == net.minecraft.world.effect.MobEffects.NIGHT_VISION.value() ? 300 : 60;
                player.addEffect(new MobEffectInstance(e, duration, p.amplifier(), true, false, true));
            });
        }
    }

    private static java.util.Optional<net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect>> effect(String id) {
        var rl = net.minecraft.resources.Identifier.tryParse(id == null ? "" : id);
        if (rl == null) return java.util.Optional.empty();
        return net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.get(rl).map(h -> (net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect>) h);
    }
}
