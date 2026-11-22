package com.aidraw.ai;

import com.aidraw.Palette;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.*;

/** Real calls to Gemini. Runs only when GEMINI_API_KEY is set: GEMINI_API_KEY=... ./gradlew test */
@EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
class GeminiLiveTest {
    @BeforeAll
    static void boot() {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
    }

    /** A crude grey sword with a brown handle, like a player would draw. */
    private static byte[] swordDrawing() {
        int n = Palette.SIZE;
        byte[] px = new byte[n * n];
        for (int i = 4; i < 22; i++) { px[i * n + (27 - i)] = 2; px[i * n + (28 - i)] = 2; px[(i + 1) * n + (27 - i)] = 2; } // blade
        for (int i = 0; i < 7; i++) { px[(19 + i) * n + (6 + i)] = 13; }       // cross guard
        for (int i = 0; i < 5; i++) { px[(23 + i) * n + (8 - i)] = 13; px[(23 + i) * n + (9 - i)] = 13; } // handle
        return px;
    }

    @Test
    void recognisesDrawingWithoutHint() {
        DrawingResult r = AiRouter.classify(swordDrawing(), "").join();
        var spec = com.aidraw.item.ItemFactory.buildSpec(r.raw());
        System.out.println("NO HINT -> " + r.category() + " | " + r.name() + " | " + r.description() + " | dmg " + r.attackDamage() + " | " + spec);
        assertNotNull(r.category());
        assertFalse(r.name().isBlank());
    }

    @Test
    void atomBombHint() {
        DrawingResult r = AiRouter.classify(swordDrawing(), "atom bomb").join();
        var spec = com.aidraw.item.ItemFactory.buildSpec(r.raw());
        System.out.println("ATOM BOMB -> " + r.category() + " | " + r.name() + " | " + spec);
        assertTrue(spec.use().stream().anyMatch(a -> a.type() == com.aidraw.ability.AbilityType.NUKE), spec.toString());
    }
}
