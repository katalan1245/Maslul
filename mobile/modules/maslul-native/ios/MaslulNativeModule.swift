import Compression
import ExpoModulesCore
import Foundation

/**
 * Native helpers for Maslul (see the Android module for the full story). On iOS there is no
 * earlier Maslul app, so readLegacyStore always finds nothing; fetchSiriVehicles downloads a
 * brotli SIRI snapshot and parses it off the JS thread, returning the vehicles in columns.
 */
public class MaslulNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MaslulNative")

    AsyncFunction("readLegacyStore") { () -> String? in
      nil
    }

    // iOS delivers scheduled notifications on time; there's no setting to ask for.
    Function("canScheduleExactAlarms") { () -> Bool in
      true
    }

    Function("openExactAlarmSettings") { () -> Void in
    }

    // iOS has no ongoing notification to update (live directions show in the app and alert by notification).
    AsyncFunction("updateTripNotification") { (taskName: String, title: String, text: String, progress: Double, endUrl: String, endLabel: String) -> Bool in
      false
    }

    AsyncFunction("fetchSiriVehicles") { (url: String, userAgent: String, snapshotEpochSec: Double) async throws -> [String: Any]? in
      guard let u = URL(string: url) else { return nil }
      var req = URLRequest(url: u, timeoutInterval: 30)
      req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
      let (data, response) = try await URLSession.shared.data(for: req)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
      let json = try brotliDecode(data)
      return try SiriParser(snapshotSec: Int64(snapshotEpochSec)).parse(json)
    }
  }
}

struct DecodeError: Error {}

/** Decompresses brotli with Apple's Compression framework (iOS 15+). */
func brotliDecode(_ input: Data) throws -> Data {
  let chunk = 1 << 16
  let dst = UnsafeMutablePointer<UInt8>.allocate(capacity: chunk)
  defer { dst.deallocate() }
  let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
  defer { stream.deallocate() }
  guard compression_stream_init(stream, COMPRESSION_STREAM_DECODE, COMPRESSION_BROTLI) == COMPRESSION_STATUS_OK else { throw DecodeError() }
  defer { compression_stream_destroy(stream) }
  var out = Data()
  try input.withUnsafeBytes { (src: UnsafeRawBufferPointer) in
    guard let base = src.bindMemory(to: UInt8.self).baseAddress else { throw DecodeError() }
    stream.pointee.src_ptr = base
    stream.pointee.src_size = input.count
    while true {
      stream.pointee.dst_ptr = dst
      stream.pointee.dst_size = chunk
      let status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
      out.append(dst, count: chunk - stream.pointee.dst_size)
      if status == COMPRESSION_STATUS_END { break }
      if status != COMPRESSION_STATUS_OK { throw DecodeError() }
    }
  }
  return out
}

/** The Kotlin app's SIRI parser on JSONSerialization; keep in step with src/data/liveRepository.ts. */
struct SiriParser {
  /** Vehicles that stopped reporting linger in the feed; drop them. */
  static let maxAgeSec: Int64 = 5 * 60
  let snapshotSec: Int64

  private final class Columns {
    var lineRef: [Any] = [], journeyRef: [Any] = [], vehicleRef: [Any] = [], nextStopCode: [Any] = []
    var origin: [Double] = [], recorded: [Double] = [], lat: [Double] = [], lon: [Double] = []
    // NaN stands for "not reported".
    var bearing: [Double] = [], velocity: [Double] = [], distance: [Double] = []
  }

  func parse(_ data: Data) throws -> [String: Any] {
    let root = try JSONSerialization.jsonObject(with: data)
    let c = Columns()
    walk(root, c)
    return [
      "lineRef": c.lineRef, "journeyRef": c.journeyRef, "vehicleRef": c.vehicleRef, "nextStopCode": c.nextStopCode,
      "originDeparture": c.origin, "recordedAt": c.recorded, "lat": c.lat, "lon": c.lon,
      "bearing": c.bearing, "velocityKmh": c.velocity, "distanceFromStart": c.distance,
    ]
  }

  private func walk(_ v: Any, _ c: Columns) {
    if let a = v as? [Any] {
      for x in a { walk(x, c) }
    } else if let o = v as? [String: Any] {
      for (k, x) in o {
        if k == "MonitoredStopVisit" {
          for s in (x as? [Any]) ?? [x] { visit(s, c) }
        } else {
          walk(x, c)
        }
      }
    }
  }

  /** A JSON string or number as text; anything else is nil. */
  private func str(_ v: Any?) -> String? {
    if let s = v as? String { return s }
    if let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.stringValue }
    return nil
  }

  private func num(_ v: Any?) -> Double? {
    guard let s = str(v)?.trimmingCharacters(in: .whitespaces) else { return nil }
    return Double(s)
  }

  // Made once: a snapshot has thousands of times, and ISO8601DateFormatter (thread-safe) is costly to create.
  private static let plain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()
  private static let fractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  private func time(_ v: Any?) -> Int64? {
    guard let s = str(v), let d = SiriParser.plain.date(from: s) ?? SiriParser.fractional.date(from: s) else { return nil }
    return Int64(d.timeIntervalSince1970.rounded(.down))
  }

  private func visit(_ v: Any, _ c: Columns) {
    guard let o = v as? [String: Any] else { return }
    let j = o["MonitoredVehicleJourney"] as? [String: Any] ?? [:]
    let loc = j["VehicleLocation"] as? [String: Any] ?? [:]
    let call = j["MonitoredCall"] as? [String: Any] ?? [:]
    let framed = j["FramedVehicleJourneyRef"] as? [String: Any] ?? [:]
    guard let line = str(j["LineRef"]), let lat = num(loc["Latitude"]), let lon = num(loc["Longitude"]) else { return }
    if lat == 0 || lon == 0 { return }
    guard let recorded = time(o["RecordedAtTime"]) else { return }
    if snapshotSec - recorded > SiriParser.maxAgeSec { return }
    guard let origin = time(j["OriginAimedDepartureTime"]) else { return }
    let order = str(call["Order"]).flatMap { Int($0) }
    // "0" past the first stop is the feed's "no fix" value.
    let distance = num(call["DistanceFromStop"]).flatMap { $0 > 0 || order == 1 ? $0 : nil }
    c.lineRef.append(line)
    c.journeyRef.append(str(framed["DatedVehicleJourneyRef"]) ?? NSNull())
    c.vehicleRef.append(str(j["VehicleRef"]) ?? NSNull())
    c.nextStopCode.append(str(call["StopPointRef"]) ?? NSNull())
    c.origin.append(Double(origin))
    c.recorded.append(Double(recorded))
    c.lat.append(lat)
    c.lon.append(lon)
    c.bearing.append(num(j["Bearing"]) ?? .nan)
    c.velocity.append(num(j["Velocity"]).map { $0.rounded(.towardZero) } ?? .nan)
    c.distance.append(distance ?? .nan)
  }
}
