package com.v1.player.ui.player

import android.graphics.Color as AndroidColor
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.BrightnessMedium
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.v1.player.ui.theme.pressScale
import com.v1.player.ui.theme.videoGlass
import com.v1.player.util.formatDuration
import androidx.compose.ui.graphics.Shadow
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.abs

@OptIn(UnstableApi::class)
private enum class ResizeMode(val value: Int, val label: String) {
    FIT(AspectRatioFrameLayout.RESIZE_MODE_FIT, "Fit to screen"),
    CROP(AspectRatioFrameLayout.RESIZE_MODE_ZOOM, "Crop"),
    STRETCH(AspectRatioFrameLayout.RESIZE_MODE_FILL, "Stretch"),
}

private enum class DragMode { NONE, IGNORE, UNDECIDED, SEEK, BRIGHTNESS, VOLUME }

private sealed interface DragFeedback {
    data class Seek(val target: Long, val delta: Long, val duration: Long) : DragFeedback
    data class Level(val brightness: Boolean, val value: Float) : DragFeedback
}

private data class SeekBurst(val forward: Boolean, val seconds: Int, val stamp: Long = System.nanoTime())

private val PlayerColors = darkColorScheme(
    primary = Color(0xFFF5A524),
    onPrimary = Color(0xFF1A1200),
    surface = Color(0xFF1C1B22),
    onSurface = Color.White,
)

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(player: ExoPlayer, actions: PlayerActions, inPip: Boolean, resumeNotice: ResumeNotice?) {
    MaterialTheme(colorScheme = PlayerColors) {
        val ui = rememberPlayerUiState(player)
        var controlsVisible by remember { mutableStateOf(true) }
        var locked by remember { mutableStateOf(false) }
        var resizeMode by remember { mutableStateOf(ResizeMode.FIT) }
        var tracksOpen by remember { mutableStateOf(false) }
        var scrubPosition by remember { mutableStateOf<Long?>(null) }
        var interaction by remember { mutableIntStateOf(0) }
        var flash by remember { mutableStateOf<String?>(null) }
        var dragFeedback by remember { mutableStateOf<DragFeedback?>(null) }
        var seekBurst by remember { mutableStateOf<SeekBurst?>(null) }
        var showResume by remember { mutableStateOf(false) }

        BackHandler(enabled = tracksOpen) { tracksOpen = false }

        // Auto-hide controls while playing.
        LaunchedEffect(controlsVisible, ui.isPlaying, scrubPosition, tracksOpen, interaction, locked) {
            if (controlsVisible && (ui.isPlaying || locked) && scrubPosition == null && !tracksOpen) {
                delay(if (locked) 1_500 else 3_500)
                controlsVisible = false
            }
        }
        LaunchedEffect(ui.playbackState) {
            if (ui.playbackState == Player.STATE_ENDED) controlsVisible = true
        }
        LaunchedEffect(flash) {
            if (flash != null) {
                delay(900)
                flash = null
            }
        }
        LaunchedEffect(resumeNotice) {
            showResume = resumeNotice != null
            if (resumeNotice != null) {
                delay(7_000)
                showResume = false
            }
        }
        LaunchedEffect(seekBurst) {
            if (seekBurst != null) {
                delay(750)
                seekBurst = null
            }
        }

        val doubleTapSeek: (Boolean) -> Unit = { forward ->
            val burst = seekBurst
            val seconds = if (burst != null && burst.forward == forward) burst.seconds + 10 else 10
            seekBurst = SeekBurst(forward, seconds)
            if (forward) player.seekForward() else player.seekBack()
        }

        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        setShutterBackgroundColor(AndroidColor.BLACK)
                        setKeepContentOnPlayerReset(true)
                        this.player = player
                    }
                },
                update = { view ->
                    view.resizeMode = resizeMode.value
                    view.keepScreenOn = ui.isPlaying
                },
                modifier = Modifier.fillMaxSize(),
            )

            if (!inPip) {
                // Gesture layer: tap, double-tap and swipe anywhere on the video.
                Box(
                    Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            detectTapGestures(
                                onTap = { offset ->
                                    if (tracksOpen) {
                                        tracksOpen = false
                                        return@detectTapGestures
                                    }
                                    val burst = seekBurst
                                    val forward = offset.x > size.width / 2
                                    if (!locked && burst != null && burst.forward == forward) {
                                        doubleTapSeek(forward)
                                    } else {
                                        controlsVisible = !controlsVisible
                                    }
                                },
                                onDoubleTap = { offset ->
                                    if (locked) controlsVisible = true
                                    else doubleTapSeek(offset.x > size.width / 2)
                                },
                            )
                        }
                        .pointerInput(Unit) {
                            var mode = DragMode.NONE
                            var startX = 0f
                            var accumX = 0f
                            var seekStart = 0L
                            var lastPreviewSeek = 0L
                            var level = 0f
                            val edge = 40.dp.toPx()

                            fun finish(commit: Boolean) {
                                val fb = dragFeedback
                                if (commit && mode == DragMode.SEEK && fb is DragFeedback.Seek) {
                                    player.setSeekParameters(SeekParameters.EXACT)
                                    player.seekTo(fb.target)
                                }
                                mode = DragMode.NONE
                                dragFeedback = null
                            }

                            detectDragGestures(
                                onDragStart = { offset ->
                                    val nearEdge = offset.y < edge || offset.y > size.height - edge
                                    mode = if (locked || nearEdge) DragMode.IGNORE else DragMode.UNDECIDED
                                    startX = offset.x
                                    accumX = 0f
                                },
                                onDragEnd = { finish(commit = true) },
                                onDragCancel = { finish(commit = false) },
                                onDrag = { change, amount ->
                                    if (mode == DragMode.IGNORE || mode == DragMode.NONE) return@detectDragGestures
                                    change.consume()
                                    if (mode == DragMode.UNDECIDED) {
                                        mode = when {
                                            abs(amount.x) > abs(amount.y) ->
                                                if (ui.duration > 0) DragMode.SEEK else DragMode.IGNORE
                                            startX < size.width / 2 -> DragMode.BRIGHTNESS
                                            else -> DragMode.VOLUME
                                        }
                                        when (mode) {
                                            DragMode.SEEK -> {
                                                seekStart = player.currentPosition
                                                lastPreviewSeek = seekStart
                                                player.setSeekParameters(SeekParameters.CLOSEST_SYNC)
                                            }
                                            DragMode.BRIGHTNESS -> level = actions.getBrightness()
                                            DragMode.VOLUME -> level = actions.getVolume()
                                            else -> Unit
                                        }
                                    }
                                    when (mode) {
                                        DragMode.SEEK -> {
                                            accumX += amount.x
                                            val delta = (accumX / size.width * SWIPE_SEEK_RANGE_MS).toLong()
                                            val target = (seekStart + delta).coerceIn(0L, ui.duration)
                                            dragFeedback = DragFeedback.Seek(target, target - seekStart, ui.duration)
                                            if (abs(target - lastPreviewSeek) > 750) {
                                                lastPreviewSeek = target
                                                player.seekTo(target)
                                            }
                                        }
                                        DragMode.BRIGHTNESS, DragMode.VOLUME -> {
                                            level = (level - amount.y / (size.height * 0.75f)).coerceIn(0f, 1f)
                                            val brightness = mode == DragMode.BRIGHTNESS
                                            if (brightness) actions.setBrightness(level) else actions.setVolume(level)
                                            dragFeedback = DragFeedback.Level(brightness, level)
                                        }
                                        else -> Unit
                                    }
                                },
                            )
                        }
                )

                SeekBurstIndicator(seekBurst)

                if (ui.isBuffering && (!controlsVisible || locked)) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .size(56.dp),
                    )
                }

                AnimatedVisibility(
                    visible = controlsVisible && !locked && ui.error == null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Controls(
                        ui = ui,
                        player = player,
                        actions = actions,
                        scrubPosition = scrubPosition,
                        onScrub = { position ->
                            if (scrubPosition == null) player.setSeekParameters(SeekParameters.CLOSEST_SYNC)
                            scrubPosition = position
                            player.seekTo(position)
                        },
                        onScrubEnd = {
                            scrubPosition?.let {
                                player.setSeekParameters(SeekParameters.EXACT)
                                player.seekTo(it)
                            }
                            scrubPosition = null
                        },
                        onLock = {
                            locked = true
                            flash = "Controls locked"
                        },
                        onResize = {
                            resizeMode = ResizeMode.entries[(resizeMode.ordinal + 1) % ResizeMode.entries.size]
                            flash = resizeMode.label
                            interaction++
                        },
                        onTracks = { tracksOpen = true },
                        onInteract = { interaction++ },
                    )
                }

                AnimatedVisibility(
                    visible = locked && controlsVisible,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(start = 24.dp),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        RoundIconButton(Icons.Filled.LockOpen, "Unlock", size = 56.dp) {
                            locked = false
                            controlsVisible = true
                        }
                        Spacer(Modifier.height(6.dp))
                        Text("Tap to unlock", color = Color.White, fontSize = 12.sp)
                    }
                }

                DragIndicator(dragFeedback)

                AnimatedVisibility(
                    visible = showResume && resumeNotice != null && ui.error == null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(top = 76.dp),
                ) {
                    Row(
                        Modifier
                            .videoGlass(CircleShape)
                            .padding(start = 18.dp, end = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Resumed from ${formatDuration(resumeNotice?.positionMs ?: 0L)}",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = {
                            showResume = false
                            actions.startOver()
                        }) {
                            Text("Start over", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                flash?.let { message ->
                    Text(
                        message,
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .windowInsetsPadding(WindowInsets.safeDrawing)
                            .padding(top = 80.dp)
                            .videoGlass(CircleShape)
                            .padding(horizontal = 18.dp, vertical = 8.dp),
                    )
                }

                ui.error?.let { ErrorOverlay(it.errorCodeName, ui.hasNext, player, actions) }

                AnimatedVisibility(
                    visible = tracksOpen,
                    enter = slideInHorizontally { it } + fadeIn(),
                    exit = slideOutHorizontally { it } + fadeOut(),
                    modifier = Modifier.align(Alignment.CenterEnd),
                ) {
                    TracksPanel(
                        tracks = ui.tracks,
                        player = player,
                        onAddSubtitle = {
                            tracksOpen = false
                            actions.pickSubtitleFile()
                        },
                        onClose = { tracksOpen = false },
                    )
                }
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun AnimatedVisibilityScope.Controls(
    ui: PlayerUiState,
    player: ExoPlayer,
    actions: PlayerActions,
    scrubPosition: Long?,
    onScrub: (Long) -> Unit,
    onScrubEnd: () -> Unit,
    onLock: () -> Unit,
    onResize: () -> Unit,
    onTracks: () -> Unit,
    onInteract: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        // Top bar
        Row(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.55f), Color.Transparent)))
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
                .animateEnterExit(
                    enter = slideInVertically(tween(280)) { -it / 3 },
                    exit = slideOutVertically(tween(220)) { -it / 3 },
                )
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", size = 44.dp, onClick = actions::close)
            Text(
                ui.title,
                color = Color.White,
                style = MaterialTheme.typography.titleMedium.copy(shadow = TextShadow),
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
            )
            Row(
                Modifier
                    .height(44.dp)
                    .videoGlass(CircleShape)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SpeedButton(ui.speed) {
                    player.setPlaybackSpeed(it)
                    onInteract()
                }
                IconButton(onClick = onTracks) {
                    Icon(Icons.Filled.Subtitles, contentDescription = "Audio and subtitles", tint = Color.White)
                }
            }
        }

        // Center transport
        Row(
            Modifier
                .align(Alignment.Center)
                .animateEnterExit(enter = scaleIn(tween(260), initialScale = 0.92f), exit = scaleOut(tween(200), targetScale = 0.92f)),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (ui.hasPrevious || ui.hasNext) {
                RoundIconButton(Icons.Filled.SkipPrevious, "Previous", size = 46.dp, enabled = ui.hasPrevious || ui.position > 3_000) {
                    actions.previous(); onInteract()
                }
            }
            RoundIconButton(Icons.Filled.Replay10, "Back 10 seconds", size = 52.dp) {
                player.seekBack(); onInteract()
            }
            val ended = ui.playbackState == Player.STATE_ENDED
            RoundIconButton(
                icon = when {
                    ended -> Icons.Filled.Replay
                    ui.showPlayButton -> Icons.Filled.PlayArrow
                    else -> Icons.Filled.Pause
                },
                description = if (ui.showPlayButton) "Play" else "Pause",
                size = 72.dp,
                filled = true,
            ) {
                Util.handlePlayPauseButtonAction(player)
                onInteract()
            }
            RoundIconButton(Icons.Filled.Forward10, "Forward 10 seconds", size = 52.dp) {
                player.seekForward(); onInteract()
            }
            if (ui.hasPrevious || ui.hasNext) {
                RoundIconButton(Icons.Filled.SkipNext, "Next", size = 46.dp, enabled = ui.hasNext) {
                    actions.next(); onInteract()
                }
            }
        }

        // Bottom bar
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f))))
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))
                .animateEnterExit(
                    enter = slideInVertically(tween(280)) { it / 3 },
                    exit = slideOutVertically(tween(220)) { it / 3 },
                )
                .padding(start = 12.dp, end = 12.dp, top = 24.dp, bottom = 12.dp)
                .videoGlass(RoundedCornerShape(28.dp))
                .padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 2.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val shown = scrubPosition ?: ui.position
                TimeText(formatDuration(shown))
                SeekBar(
                    position = shown,
                    buffered = ui.buffered,
                    duration = ui.duration,
                    onScrub = onScrub,
                    onScrubEnd = onScrubEnd,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 10.dp),
                )
                TimeText(if (ui.duration > 0) formatDuration(ui.duration) else "--:--")
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onLock) {
                    Icon(Icons.Filled.Lock, contentDescription = "Lock controls", tint = Color.White)
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onResize) {
                    Icon(Icons.Filled.AspectRatio, contentDescription = "Resize video", tint = Color.White)
                }
                IconButton(onClick = { actions.toggleRotation(); onInteract() }) {
                    Icon(Icons.Filled.ScreenRotation, contentDescription = "Rotate", tint = Color.White)
                }
                if (actions.pipSupported) {
                    IconButton(onClick = actions::enterPip) {
                        Icon(Icons.Filled.PictureInPictureAlt, contentDescription = "Picture-in-picture", tint = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeText(text: String) {
    Text(
        text,
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
    )
}

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SeekBar(
    position: Long,
    buffered: Long,
    duration: Long,
    onScrub: (Long) -> Unit,
    onScrubEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val max = duration.coerceAtLeast(1L).toFloat()
    val active = MaterialTheme.colorScheme.primary
    Slider(
        value = position.coerceIn(0L, duration.coerceAtLeast(0L)).toFloat(),
        onValueChange = { onScrub(it.toLong()) },
        onValueChangeFinished = onScrubEnd,
        valueRange = 0f..max,
        enabled = duration > 0,
        modifier = modifier,
        colors = SliderDefaults.colors(thumbColor = Color.White),
        thumb = {
            Box(
                Modifier
                    .size(16.dp)
                    .background(Color.White, CircleShape)
            )
        },
        track = {
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(4.dp)
            ) {
                val y = size.height / 2
                val stroke = size.height
                val playedX = size.width * (position / max).coerceIn(0f, 1f)
                val bufferedX = size.width * (buffered / max).coerceIn(0f, 1f)
                drawLine(Color.White.copy(alpha = 0.25f), Offset(0f, y), Offset(size.width, y), stroke, StrokeCap.Round)
                drawLine(Color.White.copy(alpha = 0.45f), Offset(0f, y), Offset(bufferedX, y), stroke, StrokeCap.Round)
                drawLine(active, Offset(0f, y), Offset(playedX, y), stroke, StrokeCap.Round)
            }
        },
    )
}

@Composable
private fun SpeedButton(speed: Float, onSpeed: (Float) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }) {
            Text(speedLabel(speed), color = Color.White, fontWeight = FontWeight.SemiBold)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SPEEDS.forEach { s ->
                DropdownMenuItem(
                    text = { Text(if (s == 1f) "Normal" else speedLabel(s)) },
                    trailingIcon = { if (abs(s - speed) < 0.01f) Icon(Icons.Filled.Check, contentDescription = null) },
                    onClick = {
                        open = false
                        onSpeed(s)
                    },
                )
            }
        }
    }
}

private fun speedLabel(speed: Float): String {
    val text = if (speed % 1f == 0f) speed.toInt().toString() else speed.toString().trimEnd('0')
    return "${text}x"
}

@Composable
private fun RoundIconButton(
    icon: ImageVector,
    description: String,
    size: Dp,
    filled: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .size(size)
            .pressScale(interaction, pressedScale = 0.9f)
            .videoGlass(CircleShape)
            .then(if (filled) Modifier.background(Color.White.copy(alpha = 0.12f), CircleShape) else Modifier)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = icon,
            transitionSpec = {
                (fadeIn(tween(180)) + scaleIn(tween(180), initialScale = 0.7f)) togetherWith
                    (fadeOut(tween(120)) + scaleOut(tween(120), targetScale = 0.7f))
            },
            label = "icon",
        ) { current ->
            Icon(
                current,
                contentDescription = description,
                tint = Color.White.copy(alpha = if (enabled) 1f else 0.35f),
                modifier = Modifier.size(size * 0.52f),
            )
        }
    }
}

@Composable
private fun BoxScope.SeekBurstIndicator(burst: SeekBurst?) {
    val forward = burst?.forward ?: true
    AnimatedVisibility(
        visible = burst != null,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = Modifier
            .align(if (forward) Alignment.CenterEnd else Alignment.CenterStart)
            .fillMaxHeight()
            .fillMaxWidth(0.38f),
    ) {
        val shape = if (forward) {
            RoundedCornerShape(topStartPercent = 50, bottomStartPercent = 50)
        } else {
            RoundedCornerShape(topEndPercent = 50, bottomEndPercent = 50)
        }
        Box(
            Modifier
                .fillMaxSize()
                .clip(shape)
                .background(Color.White.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    if (forward) Icons.Filled.FastForward else Icons.Filled.FastRewind,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(40.dp),
                )
                Text(
                    "${burst?.seconds ?: 10} seconds",
                    color = Color.White,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
private fun BoxScope.DragIndicator(feedback: DragFeedback?) {
    if (feedback == null) return
    Column(
        Modifier
            .align(Alignment.Center)
            .videoGlass(RoundedCornerShape(24.dp))
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (feedback) {
            is DragFeedback.Seek -> {
                val sign = if (feedback.delta >= 0) "+" else "−"
                Text(
                    "$sign${formatDuration(abs(feedback.delta))}",
                    color = Color.White,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${formatDuration(feedback.target)} / ${formatDuration(feedback.duration)}",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            is DragFeedback.Level -> {
                val icon = when {
                    feedback.brightness -> Icons.Filled.BrightnessMedium
                    feedback.value <= 0f -> Icons.AutoMirrored.Filled.VolumeOff
                    else -> Icons.AutoMirrored.Filled.VolumeUp
                }
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { feedback.value },
                    color = Color.White,
                    trackColor = Color.White.copy(alpha = 0.25f),
                    gapSize = 0.dp,
                    drawStopIndicator = {},
                    modifier = Modifier
                        .width(140.dp)
                        .height(4.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text("${(feedback.value * 100).toInt()}%", color = Color.White, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun BoxScope.ErrorOverlay(code: String, hasNext: Boolean, player: Player, actions: PlayerActions) {
    Column(
        Modifier
            .align(Alignment.Center)
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = Color.White, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("Can't play this video", color = Color.White, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(4.dp))
        Text(
            friendlyError(code),
            color = Color.White.copy(alpha = 0.7f),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = actions::close) { Text("Close") }
            TextButton(onClick = {
                player.prepare()
                player.play()
            }) { Text("Retry") }
            if (hasNext) {
                TextButton(onClick = {
                    actions.next()
                    player.prepare()
                    player.play()
                }) { Text("Next video") }
            }
        }
    }
}

private fun friendlyError(code: String): String = when {
    code.contains("DECOD") || code.contains("FORMAT") ->
        "This file uses a format your device can't decode."
    code.contains("NETWORK") || code.contains("HTTP") || code.contains("TIMEOUT") ->
        "Check your connection and try again."
    code.contains("FILE_NOT_FOUND") || code.contains("NO_PERMISSION") ->
        "The file couldn't be opened. It may have been moved or deleted."
    else -> "Something went wrong ($code)."
}

@Composable
private fun TracksPanel(
    tracks: Tracks,
    player: Player,
    onAddSubtitle: () -> Unit,
    onClose: () -> Unit,
) {
    val audioGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO && it.isSupported }
    val textGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_TEXT && it.isSupported }
    val textOff = textGroups.none { it.isSelected }

    Column(
        Modifier
            .fillMaxHeight()
            .widthIn(max = 340.dp)
            .fillMaxWidth(0.85f)
            .clip(RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp))
            .background(Color(0xE6151320))
            .videoGlass(RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp))
            .pointerInput(Unit) { detectTapGestures { } } // don't let taps fall through to the video
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical + WindowInsetsSides.End))
            .verticalScroll(rememberScrollState())
            .padding(vertical = 12.dp),
    ) {
        Row(
            Modifier.padding(start = 20.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Audio & subtitles", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Close") }
        }

        SectionHeader("Audio")
        if (audioGroups.isEmpty()) {
            PanelHint("No audio tracks")
        } else {
            var n = 0
            audioGroups.forEach { group ->
                for (i in 0 until group.length) {
                    if (!group.isTrackSupported(i)) continue
                    n++
                    TrackOption(
                        label = trackLabel(group.getTrackFormat(i), n, C.TRACK_TYPE_AUDIO),
                        selected = group.isTrackSelected(i),
                    ) { selectTrack(player, group, i) }
                }
            }
        }

        SectionHeader("Subtitles")
        TrackOption(label = "Off", selected = textOff) {
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        }
        var n = 0
        textGroups.forEach { group ->
            for (i in 0 until group.length) {
                if (!group.isTrackSupported(i)) continue
                n++
                TrackOption(
                    label = trackLabel(group.getTrackFormat(i), n, C.TRACK_TYPE_TEXT),
                    selected = group.isTrackSelected(i),
                ) { selectTrack(player, group, i) }
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onAddSubtitle)
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.AutoMirrored.Filled.NoteAdd, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Text("Load subtitle file…", color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = Color.White.copy(alpha = 0.6f),
        modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun PanelHint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = Color.White.copy(alpha = 0.6f),
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
    )
}

@Composable
private fun TrackOption(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (selected) Icon(Icons.Filled.Check, contentDescription = "Selected", tint = MaterialTheme.colorScheme.primary)
    }
}

private fun selectTrack(player: Player, group: Tracks.Group, index: Int) {
    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
        .setTrackTypeDisabled(group.type, false)
        .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, index))
        .build()
}

private fun trackLabel(format: Format, number: Int, type: Int): String {
    val parts = mutableListOf<String>()
    format.label?.takeIf { it.isNotBlank() }?.let { parts += it }
    format.language?.takeIf { it.isNotBlank() && it != C.LANGUAGE_UNDETERMINED }?.let { tag ->
        val name = Locale.forLanguageTag(tag).getDisplayName(Locale.getDefault())
        if (name.isNotBlank() && parts.none { it.equals(name, ignoreCase = true) }) parts += name
    }
    if (type == C.TRACK_TYPE_AUDIO && format.channelCount != Format.NO_VALUE) {
        parts += when (format.channelCount) {
            1 -> "Mono"
            2 -> "Stereo"
            6 -> "5.1"
            8 -> "7.1"
            else -> "${format.channelCount} ch"
        }
    }
    return if (parts.isEmpty()) "Track $number" else parts.joinToString(" · ")
}

private const val SWIPE_SEEK_RANGE_MS = 120_000f
private val TextShadow = Shadow(color = Color(0x99000000), blurRadius = 8f)
private val SPEEDS = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
