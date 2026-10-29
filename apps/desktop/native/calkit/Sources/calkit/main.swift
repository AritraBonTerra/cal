import AppKit
import EventKit
import Foundation

/*
 * calkit: the Mac's calendars over stdio, for Cal's Electron main process.
 *
 * Each stdin line is a request `{"id": 1, "method": "events", "params": {...}}`; each
 * stdout line is a reply `{"id": 1, "result": ...}` or `{"id": 1, "error": "..."}`, or
 * the notification `{"event": "changed"}` when anything in the calendar database changes.
 * Field names and shapes match `@cal/calendar-source`.
 *
 * macOS asks for calendar access on behalf of the app that started calkit, so the
 * Electron app's Info.plist carries the usage description.
 */

let store = EKEventStore()
let output = FileHandle.standardOutput
let outputLock = NSLock()

struct Failure: Error { let message: String }

func send(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
  outputLock.lock()
  output.write(data)
  output.write(Data([0x0A]))
  outputLock.unlock()
}

// ISO 8601 with the local offset, e.g. 2026-10-28T10:40:00-07:00.
let isoOut: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  formatter.timeZone = TimeZone.current
  return formatter
}()
let isoIn: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter
}()
let isoInFractional: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

func parseDate(_ value: Any?) throws -> Date {
  guard let text = value as? String,
    let date = isoIn.date(from: text) ?? isoInFractional.date(from: text)
  else { throw Failure(message: "expected an ISO 8601 date, got \(String(describing: value))") }
  return date
}

func accessName() -> String {
  switch EKEventStore.authorizationStatus(for: .event) {
  case .notDetermined: return "notDetermined"
  case .fullAccess: return "fullAccess"
  case .writeOnly: return "writeOnly"
  case .denied: return "denied"
  case .restricted: return "restricted"
  @unknown default: return "denied"
  }
}

func hex(_ color: CGColor?) -> String {
  guard let color, let rgb = NSColor(cgColor: color)?.usingColorSpace(.sRGB) else {
    return "#8e8e93"
  }
  let channel = { (value: CGFloat) in Int((max(0, min(1, value)) * 255).rounded()) }
  return String(
    format: "#%02x%02x%02x", channel(rgb.redComponent), channel(rgb.greenComponent),
    channel(rgb.blueComponent))
}

func calendarJSON(_ calendar: EKCalendar) -> [String: Any] {
  [
    "id": calendar.calendarIdentifier,
    "title": calendar.title,
    "color": hex(calendar.cgColor),
    "account": calendar.source?.title ?? "",
    "writable": calendar.allowsContentModifications,
  ]
}

/*
 * An occurrence's id: the event identifier, plus the occurrence's original start for
 * repeating events, since all occurrences share one identifier.
 */
func eventId(_ event: EKEvent) -> String {
  guard event.hasRecurrenceRules, let start = event.occurrenceDate else {
    return event.eventIdentifier ?? ""
  }
  return "\(event.eventIdentifier ?? "")|\(isoIn.string(from: start))"
}

func eventJSON(_ event: EKEvent) -> [String: Any] {
  var json: [String: Any] = [
    "id": eventId(event),
    "calendarId": event.calendar?.calendarIdentifier ?? "",
    "title": event.title ?? "",
    "start": isoOut.string(from: event.startDate),
    "end": isoOut.string(from: event.endDate),
    "allDay": event.isAllDay,
    "recurring": event.hasRecurrenceRules,
    "busy": event.availability != .free,
  ]
  if let location = event.location, !location.isEmpty { json["location"] = location }
  if let notes = event.notes, !notes.isEmpty { json["notes"] = notes }
  if let url = event.url { json["url"] = url.absoluteString }
  if let rule = event.recurrenceRules?.first {
    json["recurrence"] = rruleString(from: rule)
    // The series' first occurrence, which "delete all" is undone from.
    if let identifier = event.eventIdentifier, let first = store.event(withIdentifier: identifier) {
      json["seriesStart"] = isoOut.string(from: first.startDate)
      json["seriesEnd"] = isoOut.string(from: first.endDate)
    }
  }
  if let zone = event.timeZone, !event.isAllDay { json["timeZone"] = zone.identifier }
  if let alarms = event.alarms, !alarms.isEmpty {
    json["alarms"] = alarms.compactMap { alarm in
      alarm.absoluteDate == nil ? Int((-alarm.relativeOffset / 60).rounded()) : nil
    }
  }
  if let attendees = event.attendees, !attendees.isEmpty {
    json["attendees"] = attendees.map(attendeeJSON)
    if let me = attendees.first(where: \.isCurrentUser) { json["myStatus"] = statusName(me.participantStatus) }
  }
  return json
}

func statusName(_ status: EKParticipantStatus) -> String {
  switch status {
  case .accepted: return "accepted"
  case .declined: return "declined"
  case .tentative: return "tentative"
  case .pending: return "pending"
  default: return "unknown"
  }
}

func attendeeJSON(_ attendee: EKParticipant) -> [String: Any] {
  var json: [String: Any] = [
    "status": statusName(attendee.participantStatus),
    "organizer": attendee.participantRole == .chair,
  ]
  if let name = attendee.name { json["name"] = name }
  let address = attendee.url.absoluteString
  if address.lowercased().hasPrefix("mailto:") { json["email"] = String(address.dropFirst(7)) }
  return json
}

func findEvent(_ id: String) throws -> EKEvent {
  let parts = id.split(separator: "|", maxSplits: 1).map(String.init)
  guard let identifier = parts.first, let first = store.event(withIdentifier: identifier) else {
    throw Failure(message: "no event \(id)")
  }
  guard parts.count == 2 else { return first }
  let occurrence = try parseDate(parts[1])
  let predicate = store.predicateForEvents(
    withStart: occurrence.addingTimeInterval(-86_400), end: occurrence.addingTimeInterval(86_400),
    calendars: first.calendar.map { [$0] })
  guard
    let match = store.events(matching: predicate).first(where: {
      $0.eventIdentifier == identifier && $0.occurrenceDate == occurrence
    })
  else { throw Failure(message: "no occurrence \(id)") }
  return match
}

func calendar(_ id: Any?) throws -> EKCalendar {
  guard let id = id as? String, let calendar = store.calendar(withIdentifier: id) else {
    throw Failure(message: "no calendar \(String(describing: id))")
  }
  return calendar
}

func span(_ value: Any?) -> EKSpan { (value as? String) == "this" ? .thisEvent : .futureEvents }

/*
 * The event a change applies to: the occurrence for "this"/"future", the series' first
 * occurrence for "all" (EventKit has no "whole series" span, so "all" is "this and
 * future" from the start).
 */
func target(_ id: String, _ spanName: Any?) throws -> EKEvent {
  let event = try findEvent(id)
  guard (spanName as? String) == "all", let identifier = event.eventIdentifier else { return event }
  return store.event(withIdentifier: identifier) ?? event
}

func apply(_ params: [String: Any], to event: EKEvent) throws {
  if let title = params["title"] as? String { event.title = title }
  if params["calendarId"] != nil { event.calendar = try calendar(params["calendarId"]) }
  if let allDay = params["allDay"] as? Bool { event.isAllDay = allDay }
  if let zone = params["timeZone"] as? String { event.timeZone = TimeZone(identifier: zone) }
  if params["start"] != nil { event.startDate = try parseDate(params["start"]) }
  if params["end"] != nil { event.endDate = try parseDate(params["end"]) }
  if let location = params["location"] as? String { event.location = location }
  if let notes = params["notes"] as? String { event.notes = notes }
  if let url = params["url"] as? String { event.url = url.isEmpty ? nil : URL(string: url) }
  if let busy = params["busy"] as? Bool { event.availability = busy ? .busy : .free }
  if let alarms = params["alarms"] as? [Int] {
    event.alarms = alarms.map { EKAlarm(relativeOffset: TimeInterval(-$0 * 60)) }
  }
  if let rrule = params["recurrence"] as? String {
    event.recurrenceRules = rrule.isEmpty ? nil : [try recurrenceRule(from: rrule)]
  }
}

func handle(_ method: String, _ params: [String: Any], reply: @escaping (Result<Any, Error>) -> Void) {
  do {
    switch method {
    case "access":
      reply(.success(accessName()))
    case "requestAccess":
      store.requestFullAccessToEvents { _, _ in
        store.reset()
        reply(.success(accessName()))
      }
    case "calendars":
      reply(.success(store.calendars(for: .event).map(calendarJSON)))
    case "events":
      let start = try parseDate(params["start"])
      let end = try parseDate(params["end"])
      let ids = params["calendarIds"] as? [String]
      let calendars = try ids.map { try $0.map { try calendar($0) } }
      let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
      let events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
      reply(.success(events.map(eventJSON)))
    case "createEvent":
      let event = EKEvent(eventStore: store)
      event.calendar = try calendar(params["calendarId"])
      try apply(params, to: event)
      try store.save(event, span: .thisEvent, commit: true)
      reply(.success(eventJSON(event)))
    case "updateEvent":
      let id = params["id"] as? String ?? ""
      let event = try target(id, params["span"])
      var input = params["input"] as? [String: Any] ?? [:]
      if (params["span"] as? String) == "all" {
        // New times for one occurrence become a shift of the whole series.
        let occurrence = try findEvent(id)
        if input["start"] != nil {
          let delta = try parseDate(input["start"]).timeIntervalSince(occurrence.startDate)
          input["start"] = isoIn.string(from: event.startDate.addingTimeInterval(delta))
        }
        if input["end"] != nil {
          let delta = try parseDate(input["end"]).timeIntervalSince(occurrence.endDate)
          input["end"] = isoIn.string(from: event.endDate.addingTimeInterval(delta))
        }
      }
      try apply(input, to: event)
      try store.save(event, span: span(params["span"]), commit: true)
      reply(.success(eventJSON(event)))
    case "deleteEvent":
      let event = try target(params["id"] as? String ?? "", params["span"])
      try store.remove(event, span: span(params["span"]), commit: true)
      reply(.success(NSNull()))
    case "roundtripRule":
      // RRULE → EKRecurrenceRule → RRULE, for checking the conversion without calendar access.
      reply(.success(rruleString(from: try recurrenceRule(from: params["rrule"] as? String ?? ""))))
    default:
      throw Failure(message: "unknown method \(method)")
    }
  } catch {
    reply(.failure(error))
  }
}

NotificationCenter.default.addObserver(
  forName: .EKEventStoreChanged, object: store, queue: .main
) { _ in send(["event": "changed"]) }

// Reads requests on a background thread and answers on the main queue, where EventKit
// notifications are delivered too.
Thread.detachNewThread {
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
      let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let id = request["id"], let method = request["method"] as? String
    else { continue }
    let params = request["params"] as? [String: Any] ?? [:]
    DispatchQueue.main.async {
      handle(method, params) { result in
        switch result {
        case .success(let value): send(["id": id, "result": value])
        case .failure(let error):
          let message = (error as? Failure)?.message ?? error.localizedDescription
          send(["id": id, "error": message])
        }
      }
    }
  }
  // stdin closed: the app quit. Finish replies already queued, then exit.
  DispatchQueue.main.async { exit(0) }
}

RunLoop.main.run()
