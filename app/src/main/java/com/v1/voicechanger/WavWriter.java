package com.v1.voicechanger;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

/** Minimal 16-bit mono PCM WAV writer. */
final class WavWriter implements AutoCloseable {
    private final RandomAccessFile raf;
    private final int sampleRate;
    private int dataBytes;
    private byte[] scratch = new byte[0];

    WavWriter(File file, int sampleRate) throws IOException {
        this.sampleRate = sampleRate;
        raf = new RandomAccessFile(file, "rw");
        raf.setLength(0);
        raf.write(new byte[44]); // header placeholder
    }

    void write(short[] samples, int count) throws IOException {
        if (scratch.length < count * 2) scratch = new byte[count * 2];
        for (int i = 0; i < count; i++) {
            scratch[i * 2] = (byte) samples[i];
            scratch[i * 2 + 1] = (byte) (samples[i] >> 8);
        }
        raf.write(scratch, 0, count * 2);
        dataBytes += count * 2;
    }

    @Override
    public void close() throws IOException {
        raf.seek(0);
        raf.writeBytes("RIFF");
        raf.writeInt(Integer.reverseBytes(36 + dataBytes));
        raf.writeBytes("WAVEfmt ");
        raf.writeInt(Integer.reverseBytes(16));
        raf.writeShort(Short.reverseBytes((short) 1)); // PCM
        raf.writeShort(Short.reverseBytes((short) 1)); // mono
        raf.writeInt(Integer.reverseBytes(sampleRate));
        raf.writeInt(Integer.reverseBytes(sampleRate * 2));
        raf.writeShort(Short.reverseBytes((short) 2));
        raf.writeShort(Short.reverseBytes((short) 16));
        raf.writeBytes("data");
        raf.writeInt(Integer.reverseBytes(dataBytes));
        raf.close();
    }
}
