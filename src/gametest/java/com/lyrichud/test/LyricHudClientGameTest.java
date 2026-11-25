package com.lyrichud.test;

import com.lyrichud.LyricHudClient;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Creates a flat world, plays the built-in demo song and takes screenshots while
 * turning and walking, to check that lines stay where they appeared and face the player.
 */
public class LyricHudClientGameTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext ctx) {
        ctx.getInput().resizeWindow(1280, 720);
        // small view distance so the world loads quickly on slow test machines
        ctx.runOnClient(mc -> {
            mc.options.getViewDistance().setValue(4);
            mc.options.getSimulationDistance().setValue(5);
        });
        try (TestSingleplayerContext sp = ctx.worldBuilder().create()) {
            sp.getClientWorld().waitForChunksRender();
            sp.getServer().runCommand("time set 1000");
            sp.getServer().runCommand("weather clear");
            ctx.runOnClient(mc -> {
                mc.options.hudHidden = false;
                if (mc.player != null) mc.player.setPitch(-12f);
            });
            ctx.waitTicks(20);

            ctx.runOnClient(mc -> LyricHudClient.get().setDemo(true));
            ctx.waitTicks(50);                       // first line being sung
            ctx.takeScreenshot("v2-1-first-line");
            ctx.waitTicks(25);
            ctx.takeScreenshot("v2-2-highlight");
            ctx.waitTicks(35);                       // second line arrives, first fades
            ctx.takeScreenshot("v2-3-next-line");

            ctx.getInput().moveCursor(260, 0);       // look to the right: lines stay put
            ctx.waitTicks(6);
            ctx.takeScreenshot("v2-4-turned-right");

            ctx.getInput().moveCursor(-260, 0);
            ctx.getInput().holdKeyFor(o -> o.rightKey, 30); // strafe: lines stay, turn to face you
            ctx.waitTicks(4);
            ctx.takeScreenshot("v2-5-walked-sideways");

            ctx.waitTicks(40);
            ctx.takeScreenshot("v2-6-later-line");
            ctx.runOnClient(mc -> LyricHudClient.get().setDemo(false));
        }
    }
}
