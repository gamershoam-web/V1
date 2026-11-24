package com.v1.player.data

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** A video stored on your Lumen server. */
data class ServerVideo(
    val id: String,
    val title: String,
    val fileName: String,
    val sizeBytes: Long,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val created: Long,
    val hasThumb: Boolean,
    val ready: Boolean,
    /** Where you left off, or 0. */
    val progressMs: Long,
    val progressUpdated: Long,
)

open class ServerException(val code: Int, message: String) : IOException(message)
class ServerAuthException : ServerException(401, "Signed out of the server. Connect again.")

/** Saved server address and session token. */
class ServerSettings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("server", Context.MODE_PRIVATE)

    val url: String? get() = prefs.getString("url", null)
    val token: String? get() = prefs.getString("token", null)
    val connected: Boolean get() = !url.isNullOrBlank() && !token.isNullOrBlank()

    fun save(url: String, token: String) = prefs.edit().putString("url", url).putString("token", token).apply()
    fun clear() = prefs.edit().remove("token").apply()

    fun api(): ServerApi = ServerApi(url ?: throw ServerAuthException(), token)
}

/** Minimal client for the Lumen server API (plain HttpURLConnection + org.json, no extra libraries). */
class ServerApi(val baseUrl: String, private val token: String?) {

    fun streamUri(id: String): Uri = Uri.parse("$baseUrl/api/videos/$id/stream")
    fun thumbUrl(id: String): String = "$baseUrl/api/videos/$id/thumb"
    val authHeader: String? get() = token?.let { "Bearer $it" }

    suspend fun videos(): List<ServerVideo> = withContext(Dispatchers.IO) {
        val arr = request("GET", "/api/videos").getJSONArray("videos")
        (0 until arr.length()).map { parseVideo(arr.getJSONObject(it)) }
    }

    suspend fun saveProgress(id: String, positionMs: Long, durationMs: Long) = withContext(Dispatchers.IO) {
        request(
            "PUT", "/api/videos/$id/progress",
            JSONObject().put("position", positionMs).put("duration", durationMs),
        )
        Unit
    }

    suspend fun clearProgress(id: String) = withContext(Dispatchers.IO) {
        request("DELETE", "/api/videos/$id/progress")
        Unit
    }

    suspend fun deleteVideo(id: String) = withContext(Dispatchers.IO) {
        request("DELETE", "/api/videos/$id")
        Unit
    }

    // region Resumable uploads (blocking; call from a background thread)

    fun createUpload(name: String, size: Long): String =
        request("POST", "/api/uploads", JSONObject().put("name", name).put("size", size)).getString("id")

    /** Bytes the server already has for [uploadId], or null if the server doesn't know the upload. */
    fun uploadOffset(uploadId: String): Long? = try {
        request("GET", "/api/uploads/$uploadId").getLong("offset")
    } catch (e: ServerException) {
        if (e.code == 404) null else throw e
    }

    data class ChunkResult(val offset: Long, val done: Boolean, val mismatch: Boolean)

    /** Sends [length] bytes from [input] starting at [offset]. */
    fun putChunk(
        uploadId: String,
        offset: Long,
        input: InputStream,
        length: Long,
        onProgress: (sentInChunk: Long) -> Unit,
    ): ChunkResult {
        val conn = open("PUT", "/api/uploads/$uploadId").apply {
            doOutput = true
            readTimeout = 120_000
            setFixedLengthStreamingMode(length)
            setRequestProperty("Upload-Offset", offset.toString())
            setRequestProperty("Content-Type", "application/octet-stream")
        }
        try {
            conn.outputStream.use { out ->
                val buf = ByteArray(64 * 1024)
                var sent = 0L
                while (sent < length) {
                    val n = input.read(buf, 0, minOf(buf.size.toLong(), length - sent).toInt())
                    if (n < 0) throw IOException("The file ended earlier than expected")
                    out.write(buf, 0, n)
                    sent += n
                    onProgress(sent)
                }
            }
            val code = conn.responseCode
            val body = readBody(conn, code)
            if (code == 409 && body.has("offset")) return ChunkResult(body.getLong("offset"), false, true)
            throwIfError(code, body)
            return ChunkResult(body.getLong("offset"), body.optBoolean("done"), false)
        } finally {
            conn.disconnect()
        }
    }

    // endregion

    private fun open(method: String, path: String): HttpURLConnection =
        (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            authHeader?.let { setRequestProperty("Authorization", it) }
        }

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val conn = open(method, path)
        try {
            if (body != null) {
                val bytes = body.toString().toByteArray()
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(bytes.size)
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(bytes) }
            }
            val code = conn.responseCode
            val json = readBody(conn, code)
            throwIfError(code, json)
            return json
        } finally {
            conn.disconnect()
        }
    }

    private fun readBody(conn: HttpURLConnection, code: Int): JSONObject {
        val stream = if (code < 400) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        return runCatching { JSONObject(text) }.getOrElse { JSONObject() }
    }

    private fun throwIfError(code: Int, body: JSONObject) {
        if (code == 401) throw ServerAuthException()
        if (code >= 400) throw ServerException(code, body.optString("error").ifBlank { "Server error ($code)" })
    }

    private fun parseVideo(o: JSONObject): ServerVideo {
        val progress = o.optJSONObject("progress")
        return ServerVideo(
            id = o.getString("id"),
            title = o.optString("title"),
            fileName = o.optString("fileName"),
            sizeBytes = o.optLong("size"),
            durationMs = o.optLong("duration"),
            width = o.optInt("width"),
            height = o.optInt("height"),
            created = o.optLong("created"),
            hasThumb = o.optBoolean("thumb"),
            ready = o.optBoolean("ready", true),
            progressMs = progress?.optLong("position") ?: 0L,
            progressUpdated = progress?.optLong("updated") ?: 0L,
        )
    }

    companion object {
        /** Accepts "videos.example.com", "1.2.3.4:8080", "https://…/" and so on. */
        fun normalizeUrl(input: String): String {
            var s = input.trim().trimEnd('/')
            if (!s.startsWith("http://", ignoreCase = true) && !s.startsWith("https://", ignoreCase = true)) {
                // A bare IP or a :port usually means the plain-HTTP setup without a domain.
                val hostPart = s.substringBefore('/')
                val looksLikeIp = hostPart.substringBefore(':').matches(Regex("""\d{1,3}(\.\d{1,3}){3}"""))
                s = (if (looksLikeIp || hostPart.contains(':')) "http://" else "https://") + s
            }
            return s
        }

        /**
         * Checks the address and password; returns a session token. Servers set up without a
         * password don't need one at all.
         */
        suspend fun login(baseUrl: String, password: String): String = withContext(Dispatchers.IO) {
            val api = ServerApi(baseUrl, null)
            val health = try {
                api.request("GET", "/api/health")
            } catch (e: ServerException) {
                throw IOException("That address isn't a Lumen server")
            }
            if (!health.optBoolean("ok")) throw IOException("That address isn't a Lumen server")
            if (!health.optBoolean("auth", true)) return@withContext "open"
            if (password.isBlank()) throw IOException("This server needs a password")
            try {
                api.request("POST", "/api/login", JSONObject().put("password", password)).getString("token")
            } catch (e: ServerAuthException) {
                throw IOException("Wrong password")
            }
        }
    }
}

/** Sends watch progress for server videos in the background, so it survives the player closing. */
object ServerSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun pushProgress(context: Context, serverId: String, positionMs: Long, durationMs: Long) {
        val settings = ServerSettings(context)
        if (!settings.connected) return
        scope.launch {
            runCatching { settings.api().saveProgress(serverId, positionMs, durationMs) }
        }
    }
}
