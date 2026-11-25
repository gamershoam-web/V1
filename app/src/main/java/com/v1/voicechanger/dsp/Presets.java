package com.v1.voicechanger.dsp;

/** Built-in voice presets. */
public final class Presets {
    private Presets() {
    }

    public static final String[] IDS = {
            "normal", "girl", "man", "deep", "chipmunk", "baby", "robot", "alien",
            "villain", "radio", "telephone", "cave", "drunk", "ghost"
    };

    public static final String[] NAMES = {
            "Normal", "Girl", "Man", "Monster", "Chipmunk", "Baby", "Robot", "Alien",
            "Villain", "Radio", "Telephone", "Cave", "Drunk", "Ghost"
    };

    public static VoiceParams get(String id) {
        VoiceParams p = new VoiceParams();
        switch (id) {
            case "girl":
                p.pitch = 5f;
                p.treble = 3f;
                p.lowCut = 160f;
                break;
            case "man":
                p.pitch = -4f;
                p.treble = -2f;
                break;
            case "deep":
                p.pitch = -9f;
                p.treble = -4f;
                p.drive = 0.2f;
                p.gainDb = 2f;
                break;
            case "chipmunk":
                p.pitch = 10f;
                p.lowCut = 220f;
                break;
            case "baby":
                p.pitch = 7f;
                p.treble = 2f;
                p.wobbleMs = 0.6f;
                p.wobbleRate = 7f;
                p.lowCut = 200f;
                break;
            case "robot":
                p.robot = 0.9f;
                p.robotFreq = 55f;
                p.echoMs = 12f;
                p.echoFeedback = 0.55f;
                p.echoMix = 0.35f;
                break;
            case "alien":
                p.pitch = 3f;
                p.wobbleMs = 3f;
                p.wobbleRate = 6f;
                p.robot = 0.3f;
                p.robotFreq = 320f;
                break;
            case "villain":
                p.pitch = -6f;
                p.drive = 0.15f;
                p.echoMs = 70f;
                p.echoFeedback = 0.2f;
                p.echoMix = 0.25f;
                p.treble = -2f;
                break;
            case "radio":
                p.lowCut = 500f;
                p.highCut = 3000f;
                p.drive = 0.5f;
                break;
            case "telephone":
                p.lowCut = 300f;
                p.highCut = 3400f;
                p.drive = 0.1f;
                break;
            case "cave":
                p.echoMs = 260f;
                p.echoFeedback = 0.45f;
                p.echoMix = 0.45f;
                break;
            case "drunk":
                p.pitch = -1.5f;
                p.wobbleMs = 6f;
                p.wobbleRate = 1.2f;
                break;
            case "ghost":
                p.pitch = -3f;
                p.wobbleMs = 2f;
                p.wobbleRate = 3f;
                p.echoMs = 320f;
                p.echoFeedback = 0.55f;
                p.echoMix = 0.5f;
                p.lowCut = 250f;
                break;
            case "normal":
            default:
                break;
        }
        return p;
    }
}
