package com.v1.player.ui.library

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.v1.player.data.PlaybackStore
import com.v1.player.data.VideoItem
import com.v1.player.data.VideoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SortOrder(val label: String) {
    DATE("Date added"),
    NAME("Name"),
    LENGTH("Length"),
    SIZE("Size"),
}

data class FolderInfo(val name: String, val count: Int)

data class LibraryState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val videos: List<VideoItem> = emptyList(),
    val folder: String? = null,
    val query: String = "",
    val sort: SortOrder = SortOrder.DATE,
    val grid: Boolean = true,
    /** uri -> saved resume position in ms. */
    val positions: Map<String, Long> = emptyMap(),
) {
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

    fun progressOf(video: VideoItem): Float {
        val pos = positions[video.uri.toString()] ?: return 0f
        if (video.durationMs <= 0) return 0f
        return (pos.toFloat() / video.durationMs).coerceIn(0f, 1f)
    }
}

class LibraryViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = VideoRepository(app)
    private val store = PlaybackStore(app)
    private val prefs = app.getSharedPreferences("library_settings", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(
        LibraryState(
            sort = prefs.getString(KEY_SORT, null)
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() } ?: SortOrder.DATE,
            grid = prefs.getBoolean(KEY_GRID, true),
        )
    )
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    fun load(userInitiated: Boolean = false) {
        if (userInitiated) _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            val videos = repo.loadVideos()
            val positions = store.all()
            _state.update { s ->
                val folder = s.folder?.takeIf { f -> videos.any { it.folder == f } }
                s.copy(
                    loading = false,
                    refreshing = false,
                    videos = videos,
                    positions = positions,
                    folder = folder,
                )
            }
        }
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

    private companion object {
        const val KEY_SORT = "sort"
        const val KEY_GRID = "grid"
    }
}
