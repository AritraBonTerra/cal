import icon from "../../../../../../../assets/icon.svg";
import { RowButton } from "./controls";

const RELEASES = "https://github.com/AritraBonTerra/cal/releases";

// About: the app's icon, name and version, with update and release-note links.
export function AboutSection() {
  return (
    <div className="flex flex-col items-center gap-1 pt-10 text-center">
      <img src={icon} alt="" width={64} height={64} className="mb-3" draggable={false} />
      <div className="text-title-2 font-semibold text-ink">Cal</div>
      <div className="text-small text-ink-3 tnum" data-version>
        Version {window.cal.config.version}
      </div>
      <div className="mt-5 flex gap-2">
        <RowButton onClick={() => void window.cal.checkForUpdates()}>Check for updates</RowButton>
        {/* The window opens web links in the browser. */}
        <RowButton onClick={() => window.open(RELEASES)}>Release notes</RowButton>
      </div>
    </div>
  );
}
