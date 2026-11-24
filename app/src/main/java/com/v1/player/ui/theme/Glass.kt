package com.v1.player.ui.theme

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeChild
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * The backdrop everything floats on: a deep (or pale) base with a few soft glows that drift
 * very slowly. Only the drawing is animated, so this never recomposes.
 */
@Composable
fun GlassBackdrop(modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    val phase = rememberInfiniteTransition(label = "backdrop").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 40_000, easing = LinearEasing), RepeatMode.Restart),
        label = "drift",
    )
    Canvas(modifier.fillMaxSize()) {
        drawRect(glass.base)
        val a = phase.value * 2f * PI.toFloat()
        val w = size.width
        val h = size.height
        val r = max(w, h)
        fun glow(color: Color, x: Float, y: Float, radius: Float) {
            val center = Offset(x, y)
            drawCircle(
                brush = Brush.radialGradient(listOf(color, color.copy(alpha = 0f)), center = center, radius = radius),
                radius = radius,
                center = center,
            )
        }
        glow(glass.glows[0], w * (0.12f + 0.10f * sin(a)), h * (0.10f + 0.05f * cos(a)), r * 0.55f)
        glow(glass.glows[1], w * (0.98f - 0.12f * cos(a)), h * (0.38f + 0.07f * sin(a)), r * 0.48f)
        glow(glass.glows[2], w * (0.25f + 0.14f * cos(a)), h * (0.80f - 0.05f * sin(a)), r * 0.50f)
        glow(glass.glows[3], w * (0.85f - 0.10f * sin(a)), h * (0.98f + 0.04f * cos(a)), r * 0.42f)
    }
}

/**
 * A frosted glass panel: translucent fill that's brighter at the top, and a rim that catches
 * the light on the top-left edge. With [haze], whatever scrolls behind it is blurred too
 * (Android 12+; older versions get a slightly more opaque tint instead).
 */
fun Modifier.glass(shape: Shape, haze: HazeState? = null, tint: Color? = null): Modifier = composed {
    val glass = LocalGlass.current
    val clipped = this.clip(shape)
    val blurred = if (haze != null) {
        clipped.hazeChild(
            state = haze,
            style = HazeStyle(
                backgroundColor = glass.base,
                tint = HazeTint(glass.blurTint),
                blurRadius = 26.dp,
                noiseFactor = 0.04f,
                fallbackTint = HazeTint(glass.blurTint.copy(alpha = 0.92f)),
            ),
        )
    } else {
        clipped
    }
    blurred
        .background(
            Brush.verticalGradient(
                listOf(tint ?: glass.fillTop, tint?.copy(alpha = tint.alpha * 0.6f) ?: glass.fillBottom)
            ),
            shape,
        )
        .border(
            width = 1.dp,
            brush = Brush.linearGradient(
                0f to glass.rimBright,
                0.45f to glass.rimDim,
                1f to glass.rimBright.copy(alpha = glass.rimBright.alpha * 0.45f),
            ),
            shape = shape,
        )
}

/** Glass for controls drawn over video: darker so white icons stay readable on bright scenes. */
fun Modifier.videoGlass(shape: Shape): Modifier = this
    .clip(shape)
    .background(Color(0x47000000), shape)
    .background(Brush.verticalGradient(listOf(Color(0x33FFFFFF), Color(0x0DFFFFFF))), shape)
    .border(
        width = 1.dp,
        brush = Brush.linearGradient(0f to Color(0x80FFFFFF), 0.5f to Color(0x1AFFFFFF), 1f to Color(0x40FFFFFF)),
        shape = shape,
    )

/** Gently shrinks while pressed, then springs back. */
fun Modifier.pressScale(interaction: InteractionSource, pressedScale: Float = 0.96f): Modifier = composed {
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow),
        label = "press",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
