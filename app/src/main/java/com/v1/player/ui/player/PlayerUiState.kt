package com.v1.player.ui.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import kotlinx.coroutines.delay

/** Snapshot of the player that Compose can observe. */
@Stable
class PlayerUiState(private val player: Player) {
    var isPlaying by mutableStateOf(false); private set
    var playWhenReady by mutableStateOf(false); private set
    var playbackState by mutableIntStateOf(Player.STATE_IDLE); private set
    var duration by mutableLongStateOf(0L); private set
    var position by mutableLongStateOf(0L); private set
    var buffered by mutableLongStateOf(0L); private set
    var title by mutableStateOf(""); private set
    var hasNext by mutableStateOf(false); private set
    var hasPrevious by mutableStateOf(false); private set
    var speed by mutableFloatStateOf(1f); private set
    var tracks by mutableStateOf(Tracks.EMPTY); private set
    var error by mutableStateOf<PlaybackException?>(null); private set

    val showPlayButton: Boolean
        get() = !playWhenReady || playbackState == Player.STATE_IDLE || playbackState == Player.STATE_ENDED

    val isBuffering: Boolean
        get() = playbackState == Player.STATE_BUFFERING && playWhenReady

    fun refresh() {
        isPlaying = player.isPlaying
        playWhenReady = player.playWhenReady
        playbackState = player.playbackState
        duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        title = player.mediaMetadata.title?.toString().orEmpty()
        hasNext = player.hasNextMediaItem()
        hasPrevious = player.hasPreviousMediaItem()
        speed = player.playbackParameters.speed
        tracks = player.currentTracks
        error = player.playerError
        refreshPosition()
    }

    fun refreshPosition() {
        position = player.currentPosition
        buffered = player.bufferedPosition
    }
}

@Composable
fun rememberPlayerUiState(player: Player): PlayerUiState {
    val state = remember(player) { PlayerUiState(player) }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) = state.refresh()
        }
        player.addListener(listener)
        state.refresh()
        onDispose { player.removeListener(listener) }
    }
    LaunchedEffect(player) {
        while (true) {
            state.refreshPosition()
            delay(200)
        }
    }
    return state
}
