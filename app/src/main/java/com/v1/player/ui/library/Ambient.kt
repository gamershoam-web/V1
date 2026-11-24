package com.v1.player.ui.library

import android.graphics.Bitmap
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import coil.transform.Transformation
import com.v1.player.ui.theme.LocalGlass

/**
 * The library's backdrop: the featured video's thumbnail, blurred into a soft wash of its colours
 * and faded into the page colour towards the bottom. Changes cross-fade.
 *
 * The blur works on every Android version: the image is shrunk to a few dozen pixels and drawn
 * back up with bilinear filtering. Android 12+ adds a real blur on top to smooth it further.
 */
@Composable
fun AmbientBackdrop(thumb: Any?, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    val context = LocalContext.current
    Box(
        modifier
            .fillMaxSize()
            .background(glass.base)
    ) {
        Crossfade(targetState = thumb, animationSpec = tween(1200), label = "ambient") { current ->
            if (current != null) {
                val request = remember(current) {
                    val builder = ImageRequest.Builder(context)
                    when (current) {
                        is ServerThumb -> builder.data(current.url).apply {
                            current.auth?.let { addHeader("Authorization", it) }
                        }
                        else -> builder.data(current)
                    }
                    builder.size(96, 54).transformations(TinyTransformation()).build()
                }
                AsyncImage(
                    model = request,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    filterQuality = FilterQuality.Low,
                    alpha = glass.ambientAlpha,
                    modifier = Modifier
                        .fillMaxSize()
                        .blur(40.dp, BlurredEdgeTreatment.Rectangle),
                )
            }
        }
        val base = glass.base
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to base.copy(alpha = 0.15f),
                        0.35f to base.copy(alpha = 0.65f),
                        0.7f to base.copy(alpha = 0.94f),
                        1f to base,
                    )
                )
        )
    }
}

/** Shrinks an image to a tiny size so drawing it full-screen gives a smooth blur. */
private class TinyTransformation : Transformation {
    override val cacheKey: String = "tiny-40"

    override suspend fun transform(input: Bitmap, size: Size): Bitmap {
        val width = 40
        val height = (width * input.height / input.width.coerceAtLeast(1)).coerceAtLeast(1)
        return Bitmap.createScaledBitmap(input, width, height, true)
    }
}
