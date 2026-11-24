package com.v1.player.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val Brand = Color(0xFF5B4BDB)

private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4DFFF),
    onPrimaryContainer = Color(0xFF170065),
    secondaryContainer = Color(0xFFE5E0F5),
    surface = Color(0xFFFCFAFF),
    background = Color(0xFFFCFAFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFC6BFFF),
    onPrimary = Color(0xFF2A1A9E),
    primaryContainer = Color(0xFF4231C2),
    onPrimaryContainer = Color(0xFFE4DFFF),
    surface = Color(0xFF131218),
    background = Color(0xFF131218),
)

@Composable
fun V1Theme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, content = content)
}
