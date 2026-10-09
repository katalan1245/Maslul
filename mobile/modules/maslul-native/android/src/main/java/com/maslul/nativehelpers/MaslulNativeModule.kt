package com.maslul.nativehelpers

import android.content.Context
import android.util.JsonReader
import android.util.JsonToken
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.brotli.dec.BrotliInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime

/**
 * Native helpers for Maslul:
 * - readLegacyStore: the Kotlin app's saved data (SharedPreferences "maslul", key "store_v1"),
 *   read once on the first launch after the update so it can be moved over.
 * - fetchSiriVehicles: downloads a brotli SIRI snapshot and parses it off the JS thread
 *   (a snapshot is ~3.6 MB of JSON), returning only the vehicles, in columns.
 */
class MaslulNativeModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }.applicationContext

  override fun definition() = ModuleDefinition {
    Name("MaslulNative")

    AsyncFunction("readLegacyStore") Coroutine { ->
      withContext(Dispatchers.IO) {
        context.getSharedPreferences("maslul", Context.MODE_PRIVATE).getString("store_v1", null)
      }
    }

    AsyncFunction("fetchSiriVehicles") Coroutine { url: String, userAgent: String, snapshotEpochSec: Double ->
      withContext(Dispatchers.IO) { fetchSiri(url, userAgent, snapshotEpochSec.toLong()) }
    }
  }

  /** The vehicles in columns (null when the server hasn't got this minute's file). */
  private fun fetchSiri(url: String, userAgent: String, snapshotSec: Long): Map<String, Any?>? {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 30_000
    conn.setRequestProperty("User-Agent", userAgent)
    try {
      if (conn.responseCode !in 200..299) return null
      val cols = Columns()
      conn.inputStream.use { s -> parse(BrotliInputStream(s.buffered()), snapshotSec, cols) }
      return cols.toMap()
    } finally {
      conn.disconnect()
    }
  }

  private class Columns {
    val lineRef = ArrayList<String>()
    val journeyRef = ArrayList<String?>()
    val vehicleRef = ArrayList<String?>()
    val nextStopCode = ArrayList<String?>()
    val origin = ArrayList<Double>()
    val recorded = ArrayList<Double>()
    val lat = ArrayList<Double>()
    val lon = ArrayList<Double>()
    // NaN stands for "not reported".
    val bearing = ArrayList<Double>()
    val velocity = ArrayList<Double>()
    val distance = ArrayList<Double>()

    fun toMap(): Map<String, Any?> = mapOf(
      "lineRef" to lineRef, "journeyRef" to journeyRef, "vehicleRef" to vehicleRef, "nextStopCode" to nextStopCode,
      "originDeparture" to origin.toDoubleArray(), "recordedAt" to recorded.toDoubleArray(),
      "lat" to lat.toDoubleArray(), "lon" to lon.toDoubleArray(), "bearing" to bearing.toDoubleArray(),
      "velocityKmh" to velocity.toDoubleArray(), "distanceFromStart" to distance.toDoubleArray(),
    )
  }

  // ---- The Kotlin app's LiveRepository parser, on android.util.JsonReader. Keep in step with
  // src/data/liveRepository.ts (which the tests check against a real snapshot). ----

  private fun parse(json: InputStream, t: Long, out: Columns) {
    JsonReader(InputStreamReader(json, Charsets.UTF_8)).use { r -> walk(r, out, t) }
  }

  private fun walk(r: JsonReader, out: Columns, t: Long) {
    when (r.peek()) {
      JsonToken.BEGIN_OBJECT -> {
        r.beginObject()
        while (r.hasNext()) {
          if (r.nextName() == "MonitoredStopVisit") {
            if (r.peek() == JsonToken.BEGIN_ARRAY) {
              r.beginArray()
              while (r.hasNext()) visit(r, t, out)
              r.endArray()
            } else {
              visit(r, t, out)
            }
          } else {
            walk(r, out, t)
          }
        }
        r.endObject()
      }
      JsonToken.BEGIN_ARRAY -> {
        r.beginArray()
        while (r.hasNext()) walk(r, out, t)
        r.endArray()
      }
      else -> r.skipValue()
    }
  }

  private class Fields {
    var recorded: String? = null
    var lineRef: String? = null
    var journeyRef: String? = null
    var origin: String? = null
    var lat: Double? = null
    var lon: Double? = null
    var bearing: Double? = null
    var velocity: Int? = null
    var vehicleRef: String? = null
    var stopRef: String? = null
    var order: Int? = null
    var distance: Double? = null
  }

  private fun visit(r: JsonReader, t: Long, out: Columns) {
    if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); return }
    val f = Fields()
    r.beginObject()
    while (r.hasNext()) {
      when (r.nextName()) {
        "RecordedAtTime" -> f.recorded = str(r)
        "MonitoredVehicleJourney" -> journey(r, f)
        else -> r.skipValue()
      }
    }
    r.endObject()
    val line = f.lineRef ?: return
    val lat = f.lat ?: return
    val lon = f.lon ?: return
    if (lat == 0.0 || lon == 0.0) return
    val recorded = time(f.recorded) ?: return
    if (t - recorded > MAX_AGE_SEC) return
    val origin = time(f.origin) ?: return
    // "0" past the first stop is the feed's "no fix" value.
    val distance = f.distance?.takeIf { it > 0 || f.order == 1 }
    out.lineRef += line
    out.journeyRef += f.journeyRef
    out.vehicleRef += f.vehicleRef
    out.nextStopCode += f.stopRef
    out.origin += origin.toDouble()
    out.recorded += recorded.toDouble()
    out.lat += lat
    out.lon += lon
    out.bearing += f.bearing ?: Double.NaN
    out.velocity += f.velocity?.toDouble() ?: Double.NaN
    out.distance += distance ?: Double.NaN
  }

  private fun journey(r: JsonReader, f: Fields) {
    if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); return }
    r.beginObject()
    while (r.hasNext()) {
      when (r.nextName()) {
        "LineRef" -> f.lineRef = str(r)
        "OriginAimedDepartureTime" -> f.origin = str(r)
        "Bearing" -> f.bearing = str(r)?.toDoubleOrNull()
        "Velocity" -> f.velocity = str(r)?.toDoubleOrNull()?.toInt()
        "VehicleRef" -> f.vehicleRef = str(r)
        "FramedVehicleJourneyRef" -> obj(r) { k -> if (k == "DatedVehicleJourneyRef") f.journeyRef = str(r) else r.skipValue() }
        "VehicleLocation" -> obj(r) { k ->
          when (k) {
            "Latitude" -> f.lat = str(r)?.toDoubleOrNull()
            "Longitude" -> f.lon = str(r)?.toDoubleOrNull()
            else -> r.skipValue()
          }
        }
        "MonitoredCall" -> obj(r) { k ->
          when (k) {
            "StopPointRef" -> f.stopRef = str(r)
            "Order" -> f.order = str(r)?.toIntOrNull()
            "DistanceFromStop" -> f.distance = str(r)?.toDoubleOrNull()
            else -> r.skipValue()
          }
        }
        else -> r.skipValue()
      }
    }
    r.endObject()
  }

  private inline fun obj(r: JsonReader, onKey: (String) -> Unit) {
    if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); return }
    r.beginObject()
    while (r.hasNext()) onKey(r.nextName())
    r.endObject()
  }

  private fun str(r: JsonReader): String? = when (r.peek()) {
    JsonToken.STRING, JsonToken.NUMBER -> r.nextString()
    else -> { r.skipValue(); null }
  }

  private fun time(s: String?): Long? = s?.let { runCatching { OffsetDateTime.parse(it).toEpochSecond() }.getOrNull() }

  private companion object {
    /** Vehicles that stopped reporting linger in the feed; drop them (LiveRepository.MAX_AGE_SEC). */
    const val MAX_AGE_SEC = 5 * 60L
  }
}
