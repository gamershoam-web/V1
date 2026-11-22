package com.aidraw.client;

import com.aidraw.Palette;
import com.aidraw.net.SubmitDrawingPayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayDeque;
import java.util.Deque;

/** The Painting Board canvas: pick colors, draw, then press "Bring it to life!". */
public class DrawingScreen extends Screen {
    private static final int N = Palette.SIZE;
    private static final int UNDO_LIMIT = 30;

    /** Kept between openings so a half-finished drawing isn't lost. */
    private static byte[] savedPixels = new byte[N * N];
    private static String savedHint = "";

    private final byte[] pixels = savedPixels;
    private final Deque<byte[]> undo = new ArrayDeque<>();
    private int color = 1;
    private int brush = 1;
    private boolean painting;
    private int paintValue;

    private int cell, canvasX, canvasY, paletteX;
    private EditBox hintBox;
    private Button brushButton;

    public DrawingScreen() {
        super(Component.translatable("screen.aidraw.title"));
    }

    @Override
    protected void init() {
        cell = Math.max(2, Math.min(8, (this.height - 90) / N));
        int canvasSize = cell * N;
        int total = canvasSize + 10 + 2 * 18;
        canvasX = (this.width - total) / 2;
        canvasY = 24;
        paletteX = canvasX + canvasSize + 10;

        int bottom = canvasY + canvasSize + 6;
        int bw = Math.max(canvasSize, 300);
        int left = (this.width - bw) / 2;

        hintBox = new EditBox(this.font, left, bottom, bw, 18, Component.literal("hint"));
        hintBox.setMaxLength(100);
        hintBox.setHint(Component.literal("What did you draw? (optional, e.g. \"laser gun\")"));
        hintBox.setValue(savedHint);
        addRenderableWidget(hintBox);

        int y = bottom + 22;
        int w = (bw - 12) / 4;
        addRenderableWidget(Button.builder(Component.literal("Undo"), b -> undo()).bounds(left, y, w, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Clear"), b -> { pushUndo(); java.util.Arrays.fill(pixels, (byte) 0); }).bounds(left + w + 4, y, w, 20).build());
        brushButton = addRenderableWidget(Button.builder(brushLabel(), b -> { brush = brush % 3 + 1; b.setMessage(brushLabel()); }).bounds(left + 2 * (w + 4), y, w, 20).build());
        addRenderableWidget(Button.builder(Component.literal("§a✦ Bring it to life!"), b -> submit()).bounds(left + 3 * (w + 4), y, w, 20).build());
    }

    private Component brushLabel() { return Component.literal("Brush: " + brush); }

    private void submit() {
        savedHint = hintBox.getValue();
        ClientPlayNetworking.send(new SubmitDrawingPayload(pixels.clone(), hintBox.getValue()));
        // Start fresh for the next drawing.
        savedPixels = new byte[N * N];
        savedHint = "";
        onClose();
    }

    @Override
    public void removed() {
        if (hintBox != null && savedPixels == pixels) savedHint = hintBox.getValue();
        super.removed();
    }

    @Override
    public boolean isPauseScreen() { return false; }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
        super.render(g, mouseX, mouseY, delta);
        g.drawCenteredString(this.font, this.title, this.width / 2, 8, 0xFFFFFFFF);

        int size = cell * N;
        g.fill(canvasX - 2, canvasY - 2, canvasX + size + 2, canvasY + size + 2, 0xFF6B4A2B); // wooden frame
        for (int y = 0; y < N; y++)
            for (int x = 0; x < N; x++) {
                int c = 0xFF000000 | Palette.RGB[pixels[y * N + x] & 0xFF];
                g.fill(canvasX + x * cell, canvasY + y * cell, canvasX + (x + 1) * cell, canvasY + (y + 1) * cell, c);
            }

        // brush preview
        int[] p = toPixel(mouseX, mouseY);
        if (p != null) {
            int r = brush - 1;
            int x0 = canvasX + Math.max(0, p[0] - r) * cell, y0 = canvasY + Math.max(0, p[1] - r) * cell;
            int x1 = canvasX + Math.min(N, p[0] + r + 1) * cell, y1 = canvasY + Math.min(N, p[1] + r + 1) * cell;
            g.renderOutline(x0, y0, x1 - x0, y1 - y0, 0x80000000);
        }

        // palette: 2 columns x 8 rows
        for (int i = 0; i < Palette.RGB.length; i++) {
            int px = paletteX + (i % 2) * 18, py = canvasY + (i / 2) * 18;
            g.fill(px - 1, py - 1, px + 17, py + 17, i == color ? 0xFFFFFF00 : 0xFF000000);
            g.fill(px, py, px + 16, py + 16, 0xFF000000 | Palette.RGB[i]);
        }
        g.drawString(this.font, "Left: paint", paletteX, canvasY + 8 * 18 + 4, 0xFFCCCCCC);
        g.drawString(this.font, "Right: erase", paletteX, canvasY + 8 * 18 + 14, 0xFFCCCCCC);
    }

    private int[] toPixel(double mx, double my) {
        int x = (int) Math.floor((mx - canvasX) / cell), y = (int) Math.floor((my - canvasY) / cell);
        if (mx < canvasX || my < canvasY || x < 0 || y < 0 || x >= N || y >= N) return null;
        return new int[]{x, y};
    }

    private void paintAt(double mx, double my) {
        int[] p = toPixel(mx, my);
        if (p == null) return;
        int r = brush - 1;
        for (int y = p[1] - r; y <= p[1] + r; y++)
            for (int x = p[0] - r; x <= p[0] + r; x++)
                if (x >= 0 && y >= 0 && x < N && y < N) pixels[y * N + x] = (byte) paintValue;
    }

    private void pushUndo() {
        undo.push(pixels.clone());
        while (undo.size() > UNDO_LIMIT) undo.removeLast();
    }

    private void undo() {
        if (!undo.isEmpty()) System.arraycopy(undo.pop(), 0, pixels, 0, pixels.length);
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        double mx = event.x(), my = event.y();
        for (int i = 0; i < Palette.RGB.length; i++) {
            int px = paletteX + (i % 2) * 18, py = canvasY + (i / 2) * 18;
            if (mx >= px && mx < px + 16 && my >= py && my < py + 16) { color = i; return true; }
        }
        if (toPixel(mx, my) != null && (event.button() == 0 || event.button() == 1)) {
            setFocused(null);
            hintBox.setFocused(false);
            pushUndo();
            painting = true;
            paintValue = event.button() == 0 ? color : 0;
            paintAt(mx, my);
            return true;
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (painting) {
            // interpolate so fast strokes stay continuous
            double steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, cell / 2.0)));
            for (int i = 0; i <= steps; i++) paintAt(event.x() - dx + dx * i / steps, event.y() - dy + dy * i / steps);
            return true;
        }
        return super.mouseDragged(event, dx, dy);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        painting = false;
        return super.mouseReleased(event);
    }
}
