package com.lyrichud;

import com.mojang.brigadier.arguments.IntegerArgumentType;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument;
import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal;

public final class LyricHudClient implements ClientModInitializer {
    public static final String MOD_ID = "lyrichud";
    public static final Logger LOG = LoggerFactory.getLogger("LyricHUD");

    private static LyricHudClient instance;

    private LyricConfig config;
    private final MediaBridge bridge = new MediaBridge();
    private final DemoSource demo = new DemoSource();
    private final LyricsService lyrics = new LyricsService();

    private KeyBinding toggleKey, playPauseKey, nextKey, prevKey;

    public static LyricHudClient get() { return instance; }

    public LyricConfig config() { return config; }

    /** What to show right now: the demo song if turned on, otherwise the music app. */
    public NowPlaying nowPlaying() {
        return demo.active() ? demo.current() : bridge.current();
    }

    public LyricsService.Result lyricsFor(NowPlaying np) {
        if (demo.active() && "demo".equals(np.app())) {
            return new LyricsService.Result(LyricsService.Status.FOUND, demo.lyrics());
        }
        return lyrics.get(np.title(), np.artist(), np.album(), np.durationMs());
    }

    @Override
    public void onInitializeClient() {
        instance = this;
        config = LyricConfig.load();

        KeyBinding.Category cat = KeyBinding.Category.create(Identifier.of(MOD_ID, "main"));
        toggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.lyrichud.toggle", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_K, cat));
        playPauseKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.lyrichud.play_pause", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_BACKSLASH, cat));
        nextKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.lyrichud.next", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_BRACKET, cat));
        prevKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.lyrichud.previous", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_LEFT_BRACKET, cat));

        ClientTickEvents.END_CLIENT_TICK.register(this::onTick);
        LyricHudRenderer renderer = new LyricHudRenderer();
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.of(MOD_ID, "lyrics"), renderer);
        // -Dlyrichud.preview=true also draws the lyrics on menu screens (for testing the look)
        if (Boolean.getBoolean("lyrichud.preview")) {
            ScreenEvents.AFTER_INIT.register((client, screen, w, h) ->
                    ScreenEvents.afterRender(screen).register((s, ctx, mx, my, delta) -> renderer.render(ctx, null)));
        }
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, access) -> dispatcher.register(
                literal("lyrichud")
                        .executes(c -> status(c.getSource()))
                        .then(literal("toggle").executes(c -> { toggle(); return 1; }))
                        .then(literal("demo").executes(c -> {
                            demo.setActive(!demo.active());
                            msg(c.getSource(), demo.active() ? "Demo song ON (run /lyrichud demo again to stop)" : "Demo song OFF");
                            return 1;
                        }))
                        .then(literal("offset")
                                .executes(c -> { msg(c.getSource(), "Lyric offset is " + config.offsetMs + " ms"); return 1; })
                                .then(argument("ms", IntegerArgumentType.integer(-30000, 30000)).executes(c -> {
                                    config.offsetMs = IntegerArgumentType.getInteger(c, "ms");
                                    config.save();
                                    msg(c.getSource(), "Lyric offset set to " + config.offsetMs + " ms");
                                    return 1;
                                })))
                        .then(literal("reload").executes(c -> {
                            config = LyricConfig.load();
                            lyrics.clearFailures();
                            msg(c.getSource(), "Reloaded config and retrying lyric searches");
                            return 1;
                        }))
        ));

        ClientLifecycleEvents.CLIENT_STOPPING.register(c -> bridge.stop());

        // -Dlyrichud.demo=true starts the demo song right away (handy for testing the look)
        if (Boolean.getBoolean("lyrichud.demo")) demo.setActive(true);

        if (MediaBridge.supported()) {
            bridge.start();
        } else {
            LOG.info("Lyric HUD: reading Spotify/YouTube only works on Windows. Use /lyrichud demo to preview.");
        }
    }

    private void onTick(MinecraftClient mc) {
        while (toggleKey.wasPressed()) toggle();
        while (playPauseKey.wasPressed()) bridge.send("toggle");
        while (nextKey.wasPressed()) bridge.send("next");
        while (prevKey.wasPressed()) bridge.send("prev");
    }

    private void toggle() {
        config.enabled = !config.enabled;
        config.save();
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player != null) {
            mc.player.sendMessage(Text.literal("Lyrics " + (config.enabled ? "shown" : "hidden")).formatted(Formatting.LIGHT_PURPLE), true);
        }
    }

    private int status(FabricClientCommandSource src) {
        NowPlaying np = nowPlaying();
        if (!MediaBridge.supported()) {
            msg(src, "Reading music apps only works on Windows. Try /lyrichud demo");
        } else if (!bridge.running()) {
            msg(src, "Music reader is not running" + (bridge.lastError() != null ? ": " + bridge.lastError() : ""));
        }
        if (np == null) {
            msg(src, "Nothing playing. Start a song in Spotify, YouTube Music or YouTube.");
        } else {
            LyricsService.Result r = lyricsFor(np);
            msg(src, "Playing: " + np.title() + " - " + np.artist() + " [" + np.app() + "]  lyrics: " + r.status());
        }
        msg(src, "Commands: /lyrichud toggle | demo | offset <ms> | reload");
        return 1;
    }

    private static void msg(FabricClientCommandSource src, String s) {
        src.sendFeedback(Text.literal("[Lyric HUD] ").formatted(Formatting.LIGHT_PURPLE).append(Text.literal(s).formatted(Formatting.WHITE)));
    }
}
