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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.v1.player.data.PlayItem
import com.v1.player.data.Playlist
import com.v1.player.data.ServerVideo
import com.v1.player.data.VideoItem
import com.v1.player.ui.library.LibraryActions
import com.v1.player.ui.library.LibraryScreen
import com.v1.player.ui.library.LibraryTab
import com.v1.player.ui.library.LibraryViewModel
import com.v1.player.ui.library.ServerThumb
import com.v1.player.ui.library.SortOrder
import com.v1.player.ui.player.PlayerActivity
import com.v1.player.ui.theme.V1Theme

class MainActivity : ComponentActivity() {
    private val viewModel: LibraryViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            V1Theme {
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

                        override fun openLocal(list: List<VideoItem>, index: Int) {
                            Playlist.set(list.map { PlayItem(it.uri, it.title) }, index)
                            play(list[index].uri)
                        }

                        override fun openServer(list: List<ServerVideo>, index: Int) {
                            val api = viewModel.serverApi() ?: return
                            // The server's position wins: it may have been watched on another device.
                            Playlist.set(
                                list.map { PlayItem(api.streamUri(it.id), it.title, serverId = it.id, resumeMs = it.progressMs) },
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
                        override fun connect(address: String, password: String) = viewModel.connect(address, password)
                        override fun resetConnect() = viewModel.resetConnectState()
                        override fun disconnect() = viewModel.disconnect()
                        override fun clearFailedUploads() = viewModel.clearFailedUploads()

                        override fun serverThumb(video: ServerVideo): ServerThumb? {
                            val api = viewModel.serverApi() ?: return null
                            return ServerThumb(api.thumbUrl(video.id), api.authHeader)
                        }
                    }
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
