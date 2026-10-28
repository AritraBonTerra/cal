import EventKit
import Foundation

/*
 * RRULE strings (without "RRULE:") ↔ EKRecurrenceRule. Cal stores and parses repeats as
 * RRULE text everywhere; EventKit has its own type with the same parts (frequency,
 * interval, days of the week with an optional week number, days of the month, months,
 * set positions, and an end by date or count).
 */

private let dayCodes: [String: EKWeekday] = [
  "SU": .sunday, "MO": .monday, "TU": .tuesday, "WE": .wednesday,
  "TH": .thursday, "FR": .friday, "SA": .saturday,
]

private let utcStamp: DateFormatter = {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = TimeZone(identifier: "UTC")
  formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
  return formatter
}()

private let dateStamp: DateFormatter = {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = "yyyyMMdd"
  return formatter
}()

func recurrenceRule(from rrule: String) throws -> EKRecurrenceRule {
  var parts: [String: String] = [:]
  for pair in rrule.split(separator: ";") {
    let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
    if kv.count == 2 { parts[kv[0].uppercased()] = kv[1] }
  }
  let frequency: EKRecurrenceFrequency
  switch parts["FREQ"] {
  case "DAILY": frequency = .daily
  case "WEEKLY": frequency = .weekly
  case "MONTHLY": frequency = .monthly
  case "YEARLY": frequency = .yearly
  default: throw Failure(message: "unsupported repeat rule \(rrule)")
  }
  let days: [EKRecurrenceDayOfWeek]? = parts["BYDAY"].map { list in
    list.split(separator: ",").compactMap { entry in
      let text = String(entry)
      guard let day = dayCodes[String(text.suffix(2))] else { return nil }
      let number = Int(text.dropLast(2)) ?? 0
      return number == 0 ? EKRecurrenceDayOfWeek(day) : EKRecurrenceDayOfWeek(day, weekNumber: number)
    }
  }
  let numbers = { (key: String) in parts[key].map { $0.split(separator: ",").compactMap { NSNumber(value: Int($0) ?? 0) } } }
  var end: EKRecurrenceEnd?
  if let count = parts["COUNT"].flatMap(Int.init) {
    end = EKRecurrenceEnd(occurrenceCount: count)
  } else if let until = parts["UNTIL"] {
    guard let date = utcStamp.date(from: until) ?? dateStamp.date(from: until) else {
      throw Failure(message: "bad UNTIL in \(rrule)")
    }
    end = EKRecurrenceEnd(end: date)
  }
  return EKRecurrenceRule(
    recurrenceWith: frequency,
    interval: Int(parts["INTERVAL"] ?? "1") ?? 1,
    daysOfTheWeek: days,
    daysOfTheMonth: numbers("BYMONTHDAY"),
    monthsOfTheYear: numbers("BYMONTH"),
    weeksOfTheYear: nil,
    daysOfTheYear: nil,
    setPositions: numbers("BYSETPOS"),
    end: end)
}

func rruleString(from rule: EKRecurrenceRule) -> String {
  var parts: [String] = []
  switch rule.frequency {
  case .daily: parts.append("FREQ=DAILY")
  case .weekly: parts.append("FREQ=WEEKLY")
  case .monthly: parts.append("FREQ=MONTHLY")
  case .yearly: parts.append("FREQ=YEARLY")
  @unknown default: parts.append("FREQ=DAILY")
  }
  if rule.interval > 1 { parts.append("INTERVAL=\(rule.interval)") }
  if let days = rule.daysOfTheWeek, !days.isEmpty {
    let codes = days.map { day -> String in
      let code = dayCodes.first(where: { $0.value == day.dayOfTheWeek })?.key ?? "MO"
      return day.weekNumber == 0 ? code : "\(day.weekNumber)\(code)"
    }
    parts.append("BYDAY=\(codes.joined(separator: ","))")
  }
  let list = { (key: String, values: [NSNumber]?) in
    if let values, !values.isEmpty { parts.append("\(key)=\(values.map(\.stringValue).joined(separator: ","))") }
  }
  list("BYMONTHDAY", rule.daysOfTheMonth)
  list("BYMONTH", rule.monthsOfTheYear)
  list("BYSETPOS", rule.setPositions)
  if let end = rule.recurrenceEnd {
    if end.occurrenceCount > 0 { parts.append("COUNT=\(end.occurrenceCount)") }
    else if let date = end.endDate { parts.append("UNTIL=\(utcStamp.string(from: date))") }
  }
  return parts.joined(separator: ";")
}
