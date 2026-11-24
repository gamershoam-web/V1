package com.v1.player.ui.library

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.v1.player.data.PlaybackStore
import com.v1.player.data.ServerApi
import com.v1.player.data.ServerAuthException
import com.v1.player.data.ServerSettings
import com.v1.player.data.SeriesInfo
import com.v1.player.data.ServerVideo
import com.v1.player.data.UploadWorker
import com.v1.player.data.VideoItem
import com.v1.player.data.VideoRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.UUID

enum class SortOrder(val label: String) {
    DATE("Date added"),
    NAME("Name"),
    LENGTH("Length"),
    SIZE("Size"),
}

enum class LibraryTab { PHONE, SERVER }

data class FolderInfo(val name: String, val count: Int)

data class UploadStatus(val id: UUID, val title: String, val progress: Float, val state: WorkInfo.State)

data class ServerState(
    val connected: Boolean = false,
    val url: String? = null,
    val loaded: Boolean = false,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
    val videos: List<ServerVideo> = emptyList(),
    val series: List<SeriesInfo> = emptyList(),
)

sealed interface ConnectState {
    data object Idle : ConnectState
    data object Working : ConnectState
    data class Failed(val message: String) : ConnectState
}

data class LibraryState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val videos: List<VideoItem> = emptyList(),
    val folder: String? = null,
    val query: String = "",
    val sort: SortOrder = SortOrder.DATE,
    val grid: Boolean = true,
    val tab: LibraryTab = LibraryTab.PHONE,
    /** uri -> saved resume position in ms. */
    val positions: Map<String, Long> = emptyMap(),
    /** uri -> when that position was saved. */
    val positionTimes: Map<String, Long> = emptyMap(),
    val server: ServerState = ServerState(),
    val uploads: List<UploadStatus> = emptyList(),
    /** Series shown full-screen on the server tab, if any. */
    val openSeriesId: String? = null,
    /** Selected season on the series screen. */
    val seasonId: String? = null,
) {
    val openSeries: SeriesInfo? get() = server.series.firstOrNull { it.id == openSeriesId }

    val folders: List<FolderInfo> by lazy {
        videos.groupingBy { it.folder }.eachCount()
            .map { (name, count) -> FolderInfo(name, count) }
            .sortedWith(compareByDescending<FolderInfo> { it.count }.thenBy { it.name.lowercase() })
    }

    val visible: List<VideoItem> by lazy {
        val q = query.trim()
        videos.asSequence()
            .filter { folder == null || it.folder == folder }
            .filter { q.isEmpty() || it.title.contains(q, ignoreCase = true) }
            .toList()
            .let { list ->
                when (sort) {
                    SortOrder.DATE -> list.sortedByDescending { it.dateAddedSec }
                    SortOrder.NAME -> list.sortedBy { it.title.lowercase() }
                    SortOrder.LENGTH -> list.sortedByDescending { it.durationMs }
                    SortOrder.SIZE -> list.sortedByDescending { it.sizeBytes }
                }
            }
    }

    /** Half-watched videos on this phone, most recently watched first. */
    val continueLocal: List<VideoItem> by lazy {
        videos.filter { progressOf(it) > 0f }
            .sortedByDescending { positionTimes[it.uri.toString()] ?: 0L }
    }

    val visibleServer: List<ServerVideo> by lazy {
        val q = query.trim()
        server.videos
            .filter { q.isEmpty() || it.title.contains(q, ignoreCase = true) }
            .let { list ->
                when (sort) {
                    SortOrder.DATE -> list.sortedByDescending { it.created }
                    SortOrder.NAME -> list.sortedBy { it.title.lowercase() }
                    SortOrder.LENGTH -> list.sortedByDescending { it.durationMs }
                    SortOrder.SIZE -> list.sortedByDescending { it.sizeBytes }
                }
            }
    }

    /** Half-watched videos on the server (from any device), most recent first. */
    val continueServer: List<ServerVideo> by lazy {
        server.videos.filter { it.progressMs > 0 }.sortedByDescending { it.progressUpdated }
    }

    fun progressOf(video: VideoItem): Float {
        val pos = positions[video.uri.toString()] ?: return 0f
        if (video.durationMs <= 0) return 0f
        return (pos.toFloat() / video.durationMs).coerceIn(0f, 1f)
    }
}

class LibraryViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = VideoRepository(app)
    private val store = PlaybackStore(app)
    private val settings = ServerSettings(app)
    private val prefs = app.getSharedPreferences("library_settings", Context.MODE_PRIVATE)
    private val seenFinishedUploads = mutableSetOf<UUID>()

    private val _state = MutableStateFlow(
        LibraryState(
            sort = prefs.getString(KEY_SORT, null)
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() } ?: SortOrder.DATE,
            grid = prefs.getBoolean(KEY_GRID, true),
            tab = if (prefs.getString(KEY_TAB, null) == LibraryTab.SERVER.name) LibraryTab.SERVER else LibraryTab.PHONE,
            server = ServerState(connected = settings.connected, url = settings.url),
        )
    )
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    private val _connect = MutableStateFlow<ConnectState>(ConnectState.Idle)
    val connectState: StateFlow<ConnectState> = _connect.asStateFlow()

    init {
        viewModelScope.launch {
            var first = true
            WorkManager.getInstance(app).getWorkInfosByTagFlow(UploadWorker.TAG).collect { infos ->
                val statuses = infos
                    .filter { it.state != WorkInfo.State.SUCCEEDED && it.state != WorkInfo.State.CANCELLED }
                    .map { info ->
                        UploadStatus(
                            id = info.id,
                            title = info.tags.firstOrNull { it.startsWith(TITLE_TAG) }?.removePrefix(TITLE_TAG) ?: "Video",
                            progress = info.progress.getFloat(UploadWorker.KEY_PROGRESS, 0f),
                            state = info.state,
                        )
                    }
                _state.update { it.copy(uploads = statuses) }
                // A new upload finished while we were watching: show it in the server list.
                // (Uploads that finished before the app opened are only remembered.)
                val newlyDone = infos.filter { it.state == WorkInfo.State.SUCCEEDED && seenFinishedUploads.add(it.id) }
                if (!first && newlyDone.isNotEmpty() && settings.connected) loadServer()
                first = false
            }
        }
    }

    // region Phone

    fun load(userInitiated: Boolean = false) {
        if (userInitiated) _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            val videos = repo.loadVideos()
            _state.update { s ->
                val folder = s.folder?.takeIf { f -> videos.any { it.folder == f } }
                s.copy(
                    loading = false,
                    refreshing = false,
                    videos = videos,
                    positions = store.all(),
                    positionTimes = store.updatedTimes(),
                    folder = folder,
                )
            }
        }
    }

    fun clearLocalProgress(video: VideoItem) {
        store.clear(video.uri.toString())
        _state.update { it.copy(positions = store.all(), positionTimes = store.updatedTimes()) }
    }

    fun uploadToServer(video: VideoItem) {
        UploadWorker.enqueue(getApplication(), video, TITLE_TAG + video.title)
    }

    fun clearFailedUploads() {
        WorkManager.getInstance(getApplication()).pruneWork()
    }

    // endregion

    // region Server

    fun loadServer(userInitiated: Boolean = false) {
        if (!settings.connected) {
            _state.update { it.copy(server = ServerState(connected = false, url = settings.url)) }
            return
        }
        _state.update {
            it.copy(server = it.server.copy(connected = true, url = settings.url, loading = true, refreshing = userInitiated))
        }
        viewModelScope.launch {
            try {
                val api = settings.api()
                val videos = api.videos()
                val series = runCatching { api.series() }.getOrDefault(_state.value.server.series)
                _state.update {
                    it.copy(server = it.server.copy(loaded = true, loading = false, refreshing = false, error = null, videos = videos, series = series))
                }
            } catch (e: ServerAuthException) {
                settings.clear()
                _state.update {
                    it.copy(server = ServerState(connected = false, url = settings.url, error = e.message))
                }
            } catch (e: IOException) {
                _state.update {
                    it.copy(server = it.server.copy(loading = false, refreshing = false, error = friendly(e)))
                }
            }
        }
    }

    fun connect(address: String, password: String) {
        val url = ServerApi.normalizeUrl(address)
        _connect.value = ConnectState.Working
        viewModelScope.launch {
            try {
                val token = ServerApi.login(url, password)
                settings.save(url, token)
                _connect.value = ConnectState.Idle
                _state.update { it.copy(tab = LibraryTab.SERVER, server = ServerState(connected = true, url = url)) }
                prefs.edit().putString(KEY_TAB, LibraryTab.SERVER.name).apply()
                loadServer()
            } catch (e: IOException) {
                _connect.value = ConnectState.Failed(friendly(e))
            }
        }
    }

    fun resetConnectState() {
        _connect.value = ConnectState.Idle
    }

    fun disconnect() {
        settings.clear()
        WorkManager.getInstance(getApplication()).cancelAllWorkByTag(UploadWorker.TAG)
        _state.update { it.copy(openSeriesId = null, server = ServerState(connected = false, url = settings.url)) }
    }

    fun clearServerProgress(video: ServerVideo) = serverAction { api ->
        api.clearProgress(video.id)
        store.clear("server:${video.id}")
    }

    fun deleteServerVideo(video: ServerVideo) = serverAction { api -> api.deleteVideo(video.id) }

    private fun serverAction(block: suspend (ServerApi) -> Unit) {
        viewModelScope.launch {
            try {
                block(settings.api())
                loadServer()
            } catch (e: IOException) {
                _state.update { it.copy(server = it.server.copy(error = friendly(e))) }
            }
        }
    }

    fun serverApi(): ServerApi? = if (settings.connected) settings.api() else null

    // region Series

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    /** Short confirmations ("Added to …") for the UI to show. */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    fun openSeries(id: String?) = _state.update { it.copy(openSeriesId = id, seasonId = if (id != it.openSeriesId) null else it.seasonId) }

    fun selectSeason(id: String) = _state.update { it.copy(seasonId = id) }

    private fun upsertSeries(series: SeriesInfo) = _state.update { st ->
        val list = st.server.series
        val updated = if (list.any { it.id == series.id }) list.map { if (it.id == series.id) series else it } else listOf(series) + list
        st.copy(server = st.server.copy(series = updated))
    }

    /** Runs a series change on the server and stores the series it sends back. */
    private fun seriesChange(message: String? = null, block: suspend (ServerApi) -> SeriesInfo) {
        viewModelScope.launch {
            try {
                upsertSeries(block(settings.api()))
                message?.let { _messages.tryEmit(it) }
            } catch (e: IOException) {
                _messages.tryEmit(friendly(e))
            }
        }
    }

    fun createSeries(title: String, firstVideo: ServerVideo? = null) {
        viewModelScope.launch {
            try {
                val api = settings.api()
                var series = api.createSeries(title)
                if (firstVideo != null) {
                    series = api.addEpisodes(series.id, series.seasons.first().id, listOf(firstVideo.id))
                    _messages.tryEmit("Created \"$title\"")
                }
                upsertSeries(series)
                if (firstVideo == null) openSeries(series.id)
            } catch (e: IOException) {
                _messages.tryEmit(friendly(e))
            }
        }
    }

    fun renameSeries(id: String, title: String) = seriesChange { it.renameSeries(id, title) }

    fun deleteSeries(id: String) {
        viewModelScope.launch {
            try {
                settings.api().deleteSeries(id)
                _state.update { st ->
                    st.copy(
                        openSeriesId = if (st.openSeriesId == id) null else st.openSeriesId,
                        server = st.server.copy(series = st.server.series.filterNot { it.id == id }),
                    )
                }
            } catch (e: IOException) {
                _messages.tryEmit(friendly(e))
            }
        }
    }

    fun addSeason(seriesId: String) {
        viewModelScope.launch {
            try {
                val series = settings.api().addSeason(seriesId)
                upsertSeries(series)
                selectSeason(series.seasons.last().id)
            } catch (e: IOException) {
                _messages.tryEmit(friendly(e))
            }
        }
    }

    fun renameSeason(seriesId: String, seasonId: String, title: String) =
        seriesChange { it.renameSeason(seriesId, seasonId, title) }

    fun deleteSeason(seriesId: String, seasonId: String) {
        _state.update { it.copy(seasonId = null) }
        seriesChange { it.deleteSeason(seriesId, seasonId) }
    }

    fun addEpisodes(seriesId: String, seasonId: String, videoIds: List<String>, seasonTitle: String) =
        seriesChange("Added ${videoIds.size} to $seasonTitle") { it.addEpisodes(seriesId, seasonId, videoIds) }

    fun removeEpisode(seriesId: String, seasonId: String, videoId: String) =
        seriesChange("Removed from season") { it.removeEpisode(seriesId, seasonId, videoId) }

    fun moveEpisode(series: SeriesInfo, seasonId: String, from: Int, to: Int) {
        val season = series.seasons.firstOrNull { it.id == seasonId } ?: return
        if (to !in season.episodes.indices) return
        val ids = season.episodes.toMutableList().apply { add(to, removeAt(from)) }
        // Show the new order straight away; the server confirms it.
        upsertSeries(series.copy(seasons = series.seasons.map { if (it.id == seasonId) it.copy(episodes = ids) else it }))
        seriesChange { it.reorderSeason(series.id, seasonId, ids) }
    }

    fun addToSeries(video: ServerVideo, seriesId: String, seasonId: String, label: String) =
        seriesChange("Added to $label") { it.addEpisodes(seriesId, seasonId, listOf(video.id)) }

    // endregion

    // endregion

    fun setTab(tab: LibraryTab) {
        prefs.edit().putString(KEY_TAB, tab.name).apply()
        _state.update { it.copy(tab = tab) }
        if (tab == LibraryTab.SERVER && settings.connected) loadServer()
    }

    fun selectFolder(folder: String?) = _state.update { it.copy(folder = folder) }

    fun setQuery(query: String) = _state.update { it.copy(query = query) }

    fun setSort(sort: SortOrder) {
        prefs.edit().putString(KEY_SORT, sort.name).apply()
        _state.update { it.copy(sort = sort) }
    }

    fun toggleGrid() {
        val grid = !_state.value.grid
        prefs.edit().putBoolean(KEY_GRID, grid).apply()
        _state.update { it.copy(grid = grid) }
    }

    private fun friendly(e: IOException): String = when (e) {
        is ServerAuthException -> e.message.orEmpty()
        is java.net.UnknownHostException -> "Can't find that server. Check the address."
        is java.net.ConnectException -> "Can't connect to the server. Is it running?"
        is java.net.SocketTimeoutException -> "The server took too long to answer."
        is javax.net.ssl.SSLException -> "Secure connection failed. Check the address (http vs https)."
        else -> e.message ?: "Something went wrong"
    }

    private companion object {
        const val KEY_SORT = "sort"
        const val KEY_GRID = "grid"
        const val KEY_TAB = "tab"
        const val TITLE_TAG = "title:"
    }
}
