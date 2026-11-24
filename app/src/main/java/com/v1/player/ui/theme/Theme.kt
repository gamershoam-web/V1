package com.v1.player.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Colours for the liquid glass look: the backdrop and the frosted panels that float on it. */
@Immutable
data class GlassColors(
    val dark: Boolean,
    /** Solid colour under everything. */
    val base: Color,
    /** Soft glows drifting in the backdrop. */
    val glows: List<Color>,
    /** Panel fill, top to bottom (light catches the top more). */
    val fillTop: Color,
    val fillBottom: Color,
    /** Rim highlight: bright where light hits, dim on the far side. */
    val rimBright: Color,
    val rimDim: Color,
    /** Tint laid over the blurred backdrop for bars that float above content. */
    val blurTint: Color,
)

private val DarkGlass = GlassColors(
    dark = true,
    base = Color(0xFF0B0A14),
    glows = listOf(Color(0xCC6D4BFF), Color(0xB32C8CFF), Color(0x99E24BC5), Color(0x8022C7E6)),
    fillTop = Color(0x2EFFFFFF),
    fillBottom = Color(0x12FFFFFF),
    rimBright = Color(0x73FFFFFF),
    rimDim = Color(0x14FFFFFF),
    blurTint = Color(0x8C14121F),
)

private val LightGlass = GlassColors(
    dark = false,
    base = Color(0xFFF1EFF9),
    glows = listOf(Color(0x997B5CFF), Color(0x804F9BFF), Color(0x80FF7AD5), Color(0x6622C7E6)),
    fillTop = Color(0xB3FFFFFF),
    fillBottom = Color(0x73FFFFFF),
    rimBright = Color(0xF2FFFFFF),
    rimDim = Color(0x4DFFFFFF),
    blurTint = Color(0x99F7F5FF),
)

val LocalGlass = staticCompositionLocalOf { DarkGlass }

private val LightColors = lightColorScheme(
    primary = Color(0xFF5B45F0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE3DEFF),
    onPrimaryContainer = Color(0xFF1A0B6B),
    secondaryContainer = Color(0xFFE6E1FF),
    onSecondaryContainer = Color(0xFF1F1747),
    background = Color(0xFFF1EFF9),
    surface = Color(0xFFF8F6FF),
    surfaceVariant = Color(0xFFE5E1F2),
    onSurfaceVariant = Color(0xFF5B5770),
    surfaceContainer = Color(0xFFF3F0FC),
    surfaceContainerHigh = Color(0xFFEDEAF8),
    surfaceContainerHighest = Color(0xFFE7E3F4),
    outlineVariant = Color(0xFFD3CEE4),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB0A4FF),
    onPrimary = Color(0xFF1E0F7A),
    primaryContainer = Color(0xFF3D2EB8),
    onPrimaryContainer = Color(0xFFE3DEFF),
    secondaryContainer = Color(0xFF2B2652),
    onSecondaryContainer = Color(0xFFE3DEFF),
    background = Color(0xFF0B0A14),
    surface = Color(0xFF16141F),
    surfaceVariant = Color(0xFF2A2738),
    onSurfaceVariant = Color(0xFFBAB5CC),
    surfaceContainer = Color(0xFF1C1A27),
    surfaceContainerHigh = Color(0xFF23212F),
    surfaceContainerHighest = Color(0xFF2B2938),
    outlineVariant = Color(0xFF3A3649),
)

private val LumenShapes = Shapes(
    extraSmall = RoundedCornerShape(14.dp),
    small = RoundedCornerShape(16.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

@Composable
fun LumenTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    CompositionLocalProvider(LocalGlass provides if (darkTheme) DarkGlass else LightGlass) {
        MaterialTheme(colorScheme = colors, shapes = LumenShapes) {
            // Screens draw straight onto the glass backdrop (no Surface), so set the text colour here.
            CompositionLocalProvider(LocalContentColor provides colors.onSurface, content = content)
        }
    }
}
