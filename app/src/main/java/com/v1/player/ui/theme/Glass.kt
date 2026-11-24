package com.v1.player.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeChild

/**
 * Frosted glass for floating chrome: translucent fill and a hairline edge. With [haze], whatever
 * scrolls behind it is blurred too (Android 12+; older versions get a more opaque tint instead).
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
