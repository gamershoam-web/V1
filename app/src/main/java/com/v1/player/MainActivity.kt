package com.v1.player

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.v1.player.data.PlayItem
import com.v1.player.data.Playlist
import com.v1.player.data.SeriesInfo
import com.v1.player.data.ServerVideo
import com.v1.player.data.VideoItem
import com.v1.player.ui.library.LibraryActions
import com.v1.player.ui.library.LibraryScreen
import com.v1.player.ui.library.LibraryTab
import com.v1.player.ui.library.LibraryViewModel
import com.v1.player.ui.library.ServerThumb
import com.v1.player.ui.library.SortOrder
import com.v1.player.ui.player.PlayerActivity
import com.v1.player.ui.theme.LumenTheme

class MainActivity : ComponentActivity() {
    private val viewModel: LibraryViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LumenTheme {
                val state by viewModel.state.collectAsStateWithLifecycle()
                val connectState by viewModel.connectState.collectAsStateWithLifecycle()
                var hasPermission by remember { mutableStateOf(hasVideoPermission(this)) }

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) {
                    hasPermission = hasVideoPermission(this)
                    if (hasPermission) viewModel.load()
                }
                val openDocument = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri -> if (uri != null) play(uri) }
                // Asked once, the first time something is uploaded, so upload progress can show.
                val notificationLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission()
                ) { }

                // Re-check access and refresh when coming back (e.g. from settings or the player).
                LifecycleResumeEffect(Unit) {
                    hasPermission = hasVideoPermission(this@MainActivity)
                    if (hasPermission) viewModel.load()
                    if (viewModel.state.value.tab == LibraryTab.SERVER) viewModel.loadServer()
                    onPauseOrDispose { }
                }

                val actions = remember {
                    object : LibraryActions {
                        override fun requestPermission() =
                            requestPermission { permissionLauncher.launch(videoPermissions()) }

                        override fun refresh() {
                            if (viewModel.state.value.tab == LibraryTab.SERVER) viewModel.loadServer(userInitiated = true)
                            else viewModel.load(userInitiated = true)
                        }

                        override fun setTab(tab: LibraryTab) = viewModel.setTab(tab)
                        override fun setQuery(query: String) = viewModel.setQuery(query)
                        override fun selectFolder(folder: String?) = viewModel.selectFolder(folder)
                        override fun setSort(sort: SortOrder) = viewModel.setSort(sort)
                        override fun toggleGrid() = viewModel.toggleGrid()

                        override fun openLocal(list: List<VideoItem>, index: Int, fromStart: Boolean) {
                            if (fromStart) viewModel.clearLocalProgress(list[index])
                            Playlist.set(list.map { PlayItem(it.uri, it.title) }, index)
                            play(list[index].uri)
                        }

                        override fun openServer(list: List<ServerVideo>, index: Int, fromStart: Boolean) {
                            val api = viewModel.serverApi() ?: return
                            if (fromStart) viewModel.clearServerProgress(list[index])
                            // The server's position wins: it may have been watched on another device.
                            Playlist.set(
                                list.mapIndexed { i, v ->
                                    val resume = if (fromStart && i == index) 0L else v.progressMs
                                    PlayItem(api.streamUri(v.id), v.title, serverId = v.id, resumeMs = resume)
                                },
                                index,
                            )
                            play(api.streamUri(list[index].id))
                        }

                        override fun openFile() = openDocument.launch(arrayOf("video/*"))
                        override fun openStream(url: String) = play(Uri.parse(url))

                        override fun uploadToServer(video: VideoItem) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS)
                                != PackageManager.PERMISSION_GRANTED
                            ) {
                                notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            viewModel.uploadToServer(video)
                            Toast.makeText(this@MainActivity, "Uploading \"${video.title}\" to your server", Toast.LENGTH_SHORT).show()
                        }

                        override fun clearLocalProgress(video: VideoItem) = viewModel.clearLocalProgress(video)
                        override fun clearServerProgress(video: ServerVideo) = viewModel.clearServerProgress(video)
                        override fun deleteServerVideo(video: ServerVideo) = viewModel.deleteServerVideo(video)
                        override fun renameLocal(video: VideoItem, title: String) = viewModel.renameLocal(video, title)
                        override fun renameServerVideo(video: ServerVideo, title: String) = viewModel.renameServerVideo(video, title)
                        override fun connect(address: String, password: String) = viewModel.connect(address, password)
                        override fun resetConnect() = viewModel.resetConnectState()
                        override fun disconnect() = viewModel.disconnect()
                        override fun clearFailedUploads() = viewModel.clearFailedUploads()

                        override fun serverThumb(video: ServerVideo): ServerThumb? {
                            val api = viewModel.serverApi() ?: return null
                            return ServerThumb(api.thumbUrl(video.id), api.authHeader)
                        }

                        override fun openSeries(id: String?) = viewModel.openSeries(id)
                        override fun selectSeason(id: String) = viewModel.selectSeason(id)
                        override fun createSeries(title: String, firstVideo: ServerVideo?) = viewModel.createSeries(title, firstVideo)
                        override fun renameSeries(id: String, title: String) = viewModel.renameSeries(id, title)
                        override fun deleteSeries(id: String) = viewModel.deleteSeries(id)
                        override fun addSeason(seriesId: String) = viewModel.addSeason(seriesId)
                        override fun renameSeason(seriesId: String, seasonId: String, title: String) =
                            viewModel.renameSeason(seriesId, seasonId, title)
                        override fun deleteSeason(seriesId: String, seasonId: String) = viewModel.deleteSeason(seriesId, seasonId)
                        override fun addEpisodes(seriesId: String, seasonId: String, videoIds: List<String>, seasonTitle: String) =
                            viewModel.addEpisodes(seriesId, seasonId, videoIds, seasonTitle)
                        override fun removeEpisode(seriesId: String, seasonId: String, videoId: String) =
                            viewModel.removeEpisode(seriesId, seasonId, videoId)
                        override fun moveEpisode(series: SeriesInfo, seasonId: String, from: Int, to: Int) =
                            viewModel.moveEpisode(series, seasonId, from, to)

                        override fun addToSeries(video: ServerVideo, series: SeriesInfo, seasonId: String) {
                            val season = series.seasons.firstOrNull { it.id == seasonId } ?: return
                            viewModel.addToSeries(video, series.id, seasonId, "${series.title} · ${season.title}")
                        }

                        override fun playSeries(series: SeriesInfo, videoId: String) {
                            val api = viewModel.serverApi() ?: return
                            val videos = viewModel.state.value.server.videos.associateBy { it.id }
                            // The whole series in order, so the next episode plays on its own, across seasons.
                            val episodes = series.episodesInOrder().mapNotNull { (id, label) -> videos[id]?.let { it to label } }
                            val index = episodes.indexOfFirst { it.first.id == videoId }.takeIf { it >= 0 } ?: return
                            Playlist.set(
                                episodes.map { (v, label) ->
                                    PlayItem(api.streamUri(v.id), "$label · ${v.title}", serverId = v.id, resumeMs = v.progressMs)
                                },
                                index,
                            )
                            play(api.streamUri(videoId))
                        }
                    }
                }

                LaunchedEffect(Unit) {
                    viewModel.messages.collect { Toast.makeText(this@MainActivity, it, Toast.LENGTH_SHORT).show() }
                }

                LibraryScreen(
                    state = state,
                    connectState = connectState,
                    hasPermission = hasPermission,
                    actions = actions,
                )
            }
        }
    }

    /**
     * Asks for access, or - if the user already said no and Android won't show the dialog again -
     * opens this app's settings page so they can allow it there.
     */
    private fun requestPermission(launch: () -> Unit) {
        val prefs = getSharedPreferences("library_settings", MODE_PRIVATE)
        val askedBefore = prefs.getBoolean("asked_permission", false)
        val canAskAgain = videoPermissions().any { shouldShowRequestPermissionRationale(it) }
        if (askedBefore && !canAskAgain) {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            )
        } else {
            prefs.edit().putBoolean("asked_permission", true).apply()
            launch()
        }
    }

    private fun play(uri: Uri) {
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
    }

    private companion object {
        fun videoPermissions(): Array<String> = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> arrayOf(
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            )
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
                arrayOf(Manifest.permission.READ_MEDIA_VIDEO)
            else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        /** Full or partial (Android 14 "selected videos") access both count. */
        fun hasVideoPermission(context: Context): Boolean = videoPermissions().any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }
}
