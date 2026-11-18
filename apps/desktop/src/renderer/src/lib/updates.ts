import { useEffect, useState } from "react";
import type { UpdateState } from "../../../shared/api";

/**
 * Where the app's update stands, for the window's prompt. Main broadcasts each change;
 * the first state is fetched too, since a launch check can land before the window loads.
 * A broadcast that arrives before that fetch answers wins over it.
 */
export function useUpdateState() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  useEffect(() => {
    let stale = false;
    const stop = window.cal.updates.onChange((next) => {
      stale = true;
      setState(next);
    });
    void window.cal.updates.state().then((first) => {
      if (!stale) setState(first);
    });
    return () => {
      stale = true;
      stop();
    };
  }, []);
  return state;
}
