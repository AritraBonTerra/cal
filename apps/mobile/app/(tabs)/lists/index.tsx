import { Workspace } from "../../../src/ipad/Workspace";
import { useIsWide } from "../../../src/lib/device";
import { ListsHub } from "../../../src/tasks/ListsHub";

export default function ListsRoute() {
  const wide = useIsWide();
  if (wide) return <Workspace initial={{ kind: "list", list: "inbox" }} />;
  return <ListsHub />;
}
