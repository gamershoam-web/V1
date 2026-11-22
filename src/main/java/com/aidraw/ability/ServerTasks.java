package com.aidraw.ability;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Runs multi-tick effects (nukes, black holes, meteor showers) on the server thread. */
public final class ServerTasks {
    /** Returns true when finished. */
    public interface Task { boolean tick(); }

    private static final List<Task> TASKS = new ArrayList<>();
    private static final List<Task> PENDING = new ArrayList<>();
    private static final Map<UUID, Long> NO_FALL_UNTIL = new ConcurrentHashMap<>();
    private static long tick;

    public static void init() {
        ServerTickEvents.END_SERVER_TICK.register(ServerTasks::onTick);
        ServerLifecycleEvents.SERVER_STOPPING.register(s -> { TASKS.clear(); PENDING.clear(); NO_FALL_UNTIL.clear(); });
    }

    public static void add(Task task) { PENDING.add(task); }

    public static void later(int delayTicks, Runnable r) {
        long at = tick + Math.max(1, delayTicks);
        add(() -> { if (tick < at) return false; r.run(); return true; });
    }

    /** Protects a player from fall damage for a while (after dashes, super jumps, flights, teleports). */
    public static void noFall(ServerPlayer player, int ticks) {
        NO_FALL_UNTIL.merge(player.getUUID(), tick + ticks, Math::max);
    }

    private static void onTick(MinecraftServer server) {
        tick++;
        TASKS.addAll(PENDING);
        PENDING.clear();
        TASKS.removeIf(t -> {
            try { return t.tick(); } catch (Exception e) { com.aidraw.AiDrawMod.LOGGER.error("Ability task failed", e); return true; }
        });
        if (!NO_FALL_UNTIL.isEmpty()) {
            NO_FALL_UNTIL.entrySet().removeIf(e -> {
                ServerPlayer p = server.getPlayerList().getPlayer(e.getKey());
                if (p == null) return true;
                p.resetFallDistance();
                return tick > e.getValue() && p.onGround();
            });
        }
    }

    private ServerTasks() {}
}
