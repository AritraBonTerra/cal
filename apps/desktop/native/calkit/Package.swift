// swift-tools-version:5.10
import PackageDescription

// calkit: EventKit over JSON lines on stdio, started by the Electron main process.
let package = Package(
  name: "calkit",
  platforms: [.macOS(.v14)],
  targets: [.executableTarget(name: "calkit", path: "Sources/calkit")]
)
