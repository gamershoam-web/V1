package com.aidraw;

/** Colors available on the Painting Board. Index 0 is the blank canvas color. */
public final class Palette {
    public static final int SIZE = 32; // canvas is SIZE x SIZE pixels
    public static final int[] RGB = {
            0xFFFFFF, 0x1D1D21, 0x9D9D97, 0x474F52, 0xB02E26, 0xF9801D, 0xFED83D, 0x80C71F,
            0x5E7C16, 0x3AB3DA, 0x3C44AA, 0x8932B8, 0xF38BAA, 0x835432, 0x169C9C, 0xC74EBD
    };
    private Palette() {}
}
