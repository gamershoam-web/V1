package com.v1.player.util

import java.util.Locale

fun formatDuration(ms: Long): String {
    val totalSec = (ms.coerceAtLeast(0) / 1000)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
    else String.format(Locale.US, "%d:%02d", m, s)
}

fun formatSize(bytes: Long): String {
    if (bytes <= 0) return ""
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit++
    }
    return if (unit >= 3) String.format(Locale.US, "%.2f %s", value, units[unit])
    else String.format(Locale.US, "%.0f %s", value, units[unit])
}

fun resolutionLabel(width: Int, height: Int): String? {
    val p = minOf(width, height)
    return when {
        p <= 0 -> null
        p >= 2160 -> "4K"
        p >= 1440 -> "1440p"
        p >= 1080 -> "1080p"
        p >= 720 -> "720p"
        p >= 480 -> "480p"
        else -> "${p}p"
    }
}
