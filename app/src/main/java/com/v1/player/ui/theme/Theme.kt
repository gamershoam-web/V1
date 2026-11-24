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

/** Colours for the floating glass chrome (top bar, tab switcher) and the ambient backdrop. */
@Immutable
data class GlassColors(
    val dark: Boolean,
    /** Solid colour under everything. */
    val base: Color,
    /** How strongly the blurred featured thumbnail shows through. */
    val ambientAlpha: Float,
    /** Panel fill, top to bottom. */
    val fillTop: Color,
    val fillBottom: Color,
    /** Hairline edge. */
    val rimBright: Color,
    val rimDim: Color,
    /** Tint laid over the blurred content behind floating bars. */
    val blurTint: Color,
)

private val DarkGlass = GlassColors(
    dark = true,
    base = Color(0xFF0E0E10),
    ambientAlpha = 0.75f,
    fillTop = Color(0x1AFFFFFF),
    fillBottom = Color(0x0AFFFFFF),
    rimBright = Color(0x26FFFFFF),
    rimDim = Color(0x0FFFFFFF),
    blurTint = Color(0xA60E0E10),
)

private val LightGlass = GlassColors(
    dark = false,
    base = Color(0xFFF6F5F2),
    ambientAlpha = 0.55f,
    fillTop = Color(0xB3FFFFFF),
    fillBottom = Color(0x80FFFFFF),
    rimBright = Color(0x1F000000),
    rimDim = Color(0x0D000000),
    blurTint = Color(0xB3F6F5F2),
)

val LocalGlass = staticCompositionLocalOf { DarkGlass }

private val LightColors = lightColorScheme(
    primary = Color(0xFFB86B00),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE2B8),
    onPrimaryContainer = Color(0xFF2E1A00),
    secondaryContainer = Color(0xFFEBEAE6),
    onSecondaryContainer = Color(0xFF151517),
    background = Color(0xFFF6F5F2),
    onBackground = Color(0xFF151517),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF151517),
    surfaceVariant = Color(0xFFEBEAE6),
    onSurfaceVariant = Color(0xFF6B6A72),
    surfaceContainer = Color(0xFFF1F0EC),
    surfaceContainerHigh = Color(0xFFEBEAE6),
    surfaceContainerHighest = Color(0xFFE4E3DF),
    outlineVariant = Color(0xFFDAD9D4),
    inverseSurface = Color(0xFF151517),
    inverseOnSurface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFF5A524),
    onPrimary = Color(0xFF1A1200),
    primaryContainer = Color(0xFF3A2A0A),
    onPrimaryContainer = Color(0xFFFFD99A),
    secondaryContainer = Color(0xFF2A2A2F),
    onSecondaryContainer = Color(0xFFF3F3F4),
    background = Color(0xFF0E0E10),
    onBackground = Color(0xFFF3F3F4),
    surface = Color(0xFF18181B),
    onSurface = Color(0xFFF3F3F4),
    surfaceVariant = Color(0xFF26262A),
    onSurfaceVariant = Color(0xFF9A9AA3),
    surfaceContainer = Color(0xFF1C1C1F),
    surfaceContainerHigh = Color(0xFF232327),
    surfaceContainerHighest = Color(0xFF2A2A2F),
    outlineVariant = Color(0xFF2E2E33),
    inverseSurface = Color(0xFFF3F3F4),
    inverseOnSurface = Color(0xFF111113),
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
