package com.aidraw.ai;

import com.aidraw.Palette;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletionException;

import static org.junit.jupiter.api.Assertions.*;

class GeminiTest {
    @BeforeAll
    static void boot() {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
    }

    @Test
    void parsesFencedAnswerAndSkipsThoughts() {
        String body = """
                {"candidates":[{"content":{"role":"model","parts":[
                  {"text":"thinking...","thought":true},
                  {"text":"```json\\n{\\"category\\":\\"BOMB\\",\\"name\\":\\"Atom Bomb\\",\\"description\\":\\"Boom.\\",\\"vanilla_id\\":\\"\\",\\"mob_id\\":\\"\\",\\"count\\":1,\\"attack_damage\\":0,\\"cooldown_seconds\\":30,\\"consumable\\":true,\\"use_abilities\\":[{\\"type\\":\\"NUKE\\",\\"strength\\":10,\\"effect_id\\":\\"\\",\\"entity_id\\":\\"\\"}],\\"hit_abilities\\":[],\\"passive_effects\\":[]}\\n```"}
                ]}}]}""";
        DrawingResult r = GeminiClient.parseBody(200, body);
        assertEquals("BOMB", r.category());
        assertEquals("Atom Bomb", r.name());
        var spec = com.aidraw.item.ItemFactory.buildSpec(r.raw());
        assertEquals(com.aidraw.ability.AbilityType.NUKE, spec.use().get(0).type());
    }

    @Test
    void errorMessages() {
        var e = assertThrows(RuntimeException.class, () -> GeminiClient.parseBody(429, "{}"));
        assertTrue(e.getMessage().contains("Free Gemini limit"));
        e = assertThrows(RuntimeException.class, () -> GeminiClient.parseBody(200, "{\"candidates\":[]}"));
        assertTrue(e.getMessage().contains("refused"));
    }

    @Test
    void bodyShape() {
        var body = GeminiClient.buildBody("AAAA", "laser gun");
        assertEquals("image/png", body.getAsJsonArray("contents").get(0).getAsJsonObject().getAsJsonArray("parts").get(0)
                .getAsJsonObject().getAsJsonObject("inlineData").get("mimeType").getAsString());
        assertEquals("application/json", body.getAsJsonObject("generationConfig").get("responseMimeType").getAsString());
        assertTrue(body.getAsJsonObject("systemInstruction").toString().contains("BLACK_HOLE"));
    }

    @Test
    void routerAndLiveEndpoint() {
        AiConfig cfg = AiConfig.get();
        String old = cfg.apiKey;
        try {
            cfg.apiKey = "AIzaInvalidTestKey000000000000000000000";
            assertEquals(AiRouter.Provider.GEMINI, AiRouter.provider());
            // Real request to Google: proves URL, headers and error handling against the live API.
            var ex = assertThrows(CompletionException.class, () -> AiRouter.classify(new byte[Palette.SIZE * Palette.SIZE], "sword").join());
            System.out.println("Live Gemini answer: " + ex.getCause().getMessage());
            assertTrue(ex.getCause().getMessage().contains("Invalid Gemini key"), ex.getCause().getMessage());
            cfg.apiKey = "sk-ant-test";
            assertEquals(AiRouter.Provider.CLAUDE, AiRouter.provider());
        } finally {
            cfg.apiKey = old;
        }
    }
}
