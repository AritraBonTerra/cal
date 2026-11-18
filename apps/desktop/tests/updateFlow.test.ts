import { describe, expect, test } from "bun:test";
import { createUpdateFlow, type Updater } from "../src/main/updateFlow";
import type { UpdateState } from "../src/shared/api";

/*
 * The update prompt's state machine, over a fake electron-updater: checks resolve
 * with `latest`, and each download waits until the test settles it.
 */
function setup(latest = "0.1.19") {
  const published: UpdateState[] = [];
  // The window hooks, in order: "close" before quitAndInstall, "failed" after it fails.
  const hooks: string[] = [];
  let finishDownload: (error?: Error) => void = () => {};
  const calls = { download: 0, quit: 0 };
  const updater: Updater = {
    checkForUpdates: async () => ({
      isUpdateAvailable: latest !== "0.1.18",
      updateInfo: { version: latest },
    }),
    downloadUpdate: () => {
      calls.download++;
      return new Promise((resolve, reject) => {
        finishDownload = (error) => (error ? reject(error) : resolve([]));
      });
    },
    quitAndInstall: () => {
      calls.quit++;
    },
  };
  const flow = createUpdateFlow(updater, {
    current: "0.1.18",
    publish: (state) => published.push(state),
    closeWindows: async () => {
      hooks.push("close");
    },
    installFailed: () => hooks.push("failed"),
  });
  return { flow, published, hooks, calls, finish: (error?: Error) => finishDownload(error) };
}

// Lets a settled download's continuation run.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("checking", () => {
  test("a manual check reports checking, then the newer version", async () => {
    const { flow, published } = setup();
    await flow.check(true);
    expect(published).toEqual([
      { status: "checking" },
      { status: "available", version: "0.1.19", current: "0.1.18" },
    ]);
  });

  test("a manual check with nothing newer says the app is current", async () => {
    const { flow } = setup("0.1.18");
    await flow.check(true);
    expect(flow.state()).toEqual({ status: "current", version: "0.1.18" });
  });

  test("a background check with nothing newer stays quiet", async () => {
    const { flow, published } = setup("0.1.18");
    await flow.check(false);
    expect(published).toEqual([]);
  });

  test("a background check offers a newer version without downloading it", async () => {
    const { flow, calls } = setup();
    await flow.check(false);
    expect(flow.state().status).toBe("available");
    expect(calls.download).toBe(0);
  });

  test("Later stops background checks offering that version, not manual ones", async () => {
    const { flow } = setup();
    await flow.check(false);
    flow.dismiss();
    await flow.check(false);
    expect(flow.state().status).toBe("idle");
    await flow.check(true);
    expect(flow.state().status).toBe("available");
  });

  test("closing the prompt mid-check drops the answer", async () => {
    const { flow } = setup();
    const checking = flow.check(true);
    flow.dismiss();
    await checking;
    expect(flow.state().status).toBe("idle");
  });

  test("a failed manual check says so; a failed background one doesn't", async () => {
    const failing = createUpdateFlow(
      {
        checkForUpdates: () => Promise.reject(new Error("offline")),
        downloadUpdate: async () => [],
        quitAndInstall: () => {},
      },
      {
        current: "0.1.18",
        publish: () => {},
        closeWindows: async () => {},
        installFailed: () => {},
      },
    );
    await failing.check(false);
    expect(failing.state().status).toBe("idle");
    await failing.check(true);
    expect(failing.state()).toEqual({ status: "failed", message: "offline" });
  });
});

describe("installing", () => {
  test("Install downloads with progress, then quits and relaunches", async () => {
    const { flow, calls, hooks, finish } = setup();
    await flow.check(true);
    const done = flow.install();
    expect(flow.state()).toEqual({ status: "downloading", version: "0.1.19", percent: 0 });
    flow.progress(41.7);
    expect(flow.state()).toEqual({ status: "downloading", version: "0.1.19", percent: 41 });
    finish();
    await done;
    expect(flow.state()).toEqual({ status: "installing", version: "0.1.19" });
    expect(hooks).toEqual(["close"]);
    expect(calls.quit).toBe(1);
  });

  test("progress republishes only when the whole percent changes", async () => {
    const { flow, published } = setup();
    await flow.check(false);
    void flow.install();
    const before = published.length;
    flow.progress(10.1);
    flow.progress(10.9);
    flow.progress(11.2);
    expect(published.length - before).toBe(2);
  });

  test("a failed download keeps the version so Retry installs it", async () => {
    const { flow, calls, finish } = setup();
    await flow.check(true);
    const done = flow.install();
    finish(new Error("connection reset"));
    await done;
    expect(flow.state()).toEqual({
      status: "failed",
      version: "0.1.19",
      message: "connection reset",
    });
    void flow.install();
    expect(flow.state().status).toBe("downloading");
    expect(calls.download).toBe(2);
    expect(calls.quit).toBe(0);
  });

  test("an install that fails lets the app carry on", async () => {
    const { flow, hooks, finish } = setup();
    await flow.check(true);
    const done = flow.install();
    finish();
    await done;
    flow.fail(new Error("code signature mismatch"));
    expect(flow.state().status).toBe("failed");
    expect(hooks).toEqual(["close", "failed"]);
  });

  test("a download under way can't be dismissed or checked over", async () => {
    const { flow } = setup();
    await flow.check(true);
    void flow.install();
    flow.dismiss();
    await flow.check(true);
    await tick();
    expect(flow.state().status).toBe("downloading");
  });

  test("an error event during the download fails it once", async () => {
    const { flow, calls, finish } = setup();
    await flow.check(true);
    const done = flow.install();
    flow.fail(new Error("disk full"));
    finish(new Error("disk full"));
    await done;
    expect(flow.state()).toEqual({ status: "failed", version: "0.1.19", message: "disk full" });
    expect(calls.quit).toBe(0);
  });
});

describe("dismissal", () => {
  test("closing a manual check drops the background check it joined", async () => {
    let answer: (version: string) => void = () => {};
    // Both checks share one request, as electron-updater's do.
    const shared = new Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } }>(
      (resolve) => {
        answer = (version) => resolve({ isUpdateAvailable: true, updateInfo: { version } });
      },
    );
    const flow = createUpdateFlow(
      { checkForUpdates: () => shared, downloadUpdate: async () => [], quitAndInstall: () => {} },
      {
        current: "0.1.18",
        publish: () => {},
        closeWindows: async () => {},
        installFailed: () => {},
      },
    );
    const background = flow.check(false);
    const manual = flow.check(true);
    flow.dismiss();
    answer("0.1.19");
    await Promise.all([background, manual]);
    expect(flow.state().status).toBe("idle");
  });
});

describe("closing the windows", () => {
  test("a window that won't close fails the install and brings the app back", async () => {
    const hooks: string[] = [];
    let quit = 0;
    const flow = createUpdateFlow(
      {
        checkForUpdates: async () => ({
          isUpdateAvailable: true,
          updateInfo: { version: "0.1.19" },
        }),
        downloadUpdate: async () => [],
        quitAndInstall: () => {
          quit++;
        },
      },
      {
        current: "0.1.18",
        publish: () => {},
        closeWindows: () => Promise.reject(new Error("A window didn't close for the update.")),
        installFailed: () => hooks.push("failed"),
      },
    );
    await flow.check(true);
    await flow.install();
    expect(flow.state()).toEqual({
      status: "failed",
      version: "0.1.19",
      message: "A window didn't close for the update.",
    });
    expect(hooks).toEqual(["failed"]);
    expect(quit).toBe(0);
  });
});
