/*
 * Sends a build already uploaded to App Store Connect to the public TestFlight group.
 * Run by .github/workflows/release.yml after each upload from main, and by
 * .github/workflows/testflight.yml to retry one by hand. It waits for Apple to finish
 * processing the build, keeps the test information Beta App Review needs up to date,
 * answers export compliance, creates the "Public" group, adds the build, submits it
 * for review and turns on the group's public link. Each step checks before it writes, so a
 * rerun picks up where the last one stopped.
 *
 * Env: ASC_KEY_PATH (the API key's .p8), ASC_KEY_ID, ASC_ISSUER_ID; CAL_VERSION and
 * CAL_BUILD name the build; BETA_CONTACT is {"firstName","lastName","email","phone"};
 * WHATS_NEW (optional) becomes the build's "What to Test".
 */

import { createPrivateKey, sign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

const BUNDLE_ID = "dev.aritra.cal";
const GROUP = "Public";
const LOCALE = "en-US";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

const key = createPrivateKey(readFileSync(env("ASC_KEY_PATH")));
const keyId = env("ASC_KEY_ID");
const issuer = env("ASC_ISSUER_ID");
const version = env("CAL_VERSION");
const buildNumber = env("CAL_BUILD");
const contact: { firstName: string; lastName: string; email: string; phone: string } = JSON.parse(
  env("BETA_CONTACT"),
);
// A merge commit's message starts with "Merge pull request #n from …"; the title follows.
// Empty means keep the build's current text (a manual rerun), or use a default for a new one.
const whatsNew = (process.env.WHATS_NEW ?? "")
  .replace(/^Merge pull request.*\n+/, "")
  .trim()
  .slice(0, 4000);

// App Store Connect tokens live at most 20 minutes, and processing can take longer, so
// each request signs a fresh one.
const token = () => {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "ES256", kid: keyId, typ: "JWT" })}.${part({ iss: issuer, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
};

type Resource<A> = { id: string; attributes: A };

async function api<T = void>(method: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const get = async <A>(path: string) => (await api<{ data: A }>("GET", path)).data;

// Updates the resource when it exists, otherwise creates it with the extra attributes
// and relationships a new one needs.
async function upsert(
  type: string,
  existing: { id: string } | undefined,
  attributes: object,
  create: { attributes: object; relationships: object },
) {
  if (existing)
    await api("PATCH", `/v1/${type}/${existing.id}`, {
      data: { type, id: existing.id, attributes },
    });
  else
    await api("POST", `/v1/${type}`, {
      data: {
        type,
        attributes: { ...attributes, ...create.attributes },
        relationships: create.relationships,
      },
    });
}

const [app] = await get<Resource<object>[]>(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
if (!app) throw new Error(`No app with bundle ID ${BUNDLE_ID} in App Store Connect.`);
const appLink = { relationships: { app: { data: { type: "apps", id: app.id } } } };

// Test information: what testers see, and who Beta App Review contacts.
const appLocalizations = await get<Resource<{ locale: string }>[]>(
  `/v1/apps/${app.id}/betaAppLocalizations`,
);
await upsert(
  "betaAppLocalizations",
  appLocalizations.find((l) => l.attributes.locale === LOCALE),
  {
    description:
      "Cal is a keyboard-first calendar, task manager and habit tracker. Plan your day by dragging to-dos onto the calendar as time blocks, and keep habits alongside them.",
    feedbackEmail: contact.email,
    privacyPolicyUrl: "https://github.com/AritraBonTerra/cal/blob/main/PRIVACY.md",
  },
  { attributes: { locale: LOCALE }, ...appLink },
);
const reviewDetail = await get<Resource<object>>(`/v1/apps/${app.id}/betaAppReviewDetail`);
await api("PATCH", `/v1/betaAppReviewDetails/${reviewDetail.id}`, {
  data: {
    type: "betaAppReviewDetails",
    id: reviewDetail.id,
    attributes: {
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      demoAccountRequired: false,
      notes:
        "Signing in is optional. Without an account Cal keeps everything on the device; Continue with Google only turns on sync with Cal on the Mac. Calendar access shows and edits the device's own events.",
    },
  },
});

// Apple lists a build a few minutes after upload and processes it for several more.
type Build = Resource<{ processingState: string; usesNonExemptEncryption?: boolean | null }>;
async function processedBuild(appId: string): Promise<Build> {
  for (const deadline = Date.now() + 60 * 60_000; ; ) {
    const [build] = await get<Build[]>(
      `/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.version]=${version}`,
    );
    const state = build?.attributes.processingState ?? "NOT LISTED";
    if (build && state === "VALID") return build;
    if (build && state !== "PROCESSING")
      throw new Error(`Build ${version} (${buildNumber}) is ${state}.`);
    if (Date.now() > deadline)
      throw new Error(`Build ${version} (${buildNumber}) is still ${state} after an hour.`);
    console.log(`Build ${version} (${buildNumber}) is ${state}; checking again in 30s.`);
    await Bun.sleep(30_000);
  }
}
const build = await processedBuild(app.id);

// app.json declares no non-exempt encryption, which answers this for new builds; older
// ones still need it set.
if (build.attributes.usesNonExemptEncryption == null)
  await api("PATCH", `/v1/builds/${build.id}`, {
    data: { type: "builds", id: build.id, attributes: { usesNonExemptEncryption: false } },
  });

// Once review approves the build, testers get it without anyone pressing "Start Testing".
const betaDetail = await get<Resource<object>>(`/v1/builds/${build.id}/buildBetaDetail`);
await api("PATCH", `/v1/buildBetaDetails/${betaDetail.id}`, {
  data: { type: "buildBetaDetails", id: betaDetail.id, attributes: { autoNotifyEnabled: true } },
});

const buildLocalizations = await get<Resource<{ locale: string }>[]>(
  `/v1/builds/${build.id}/betaBuildLocalizations`,
);
const buildLocalization = buildLocalizations.find((l) => l.attributes.locale === LOCALE);
if (whatsNew || !buildLocalization)
  await upsert(
    "betaBuildLocalizations",
    buildLocalization,
    { whatsNew: whatsNew || "Fixes and improvements." },
    {
      attributes: { locale: LOCALE },
      relationships: { build: { data: { type: "builds", id: build.id } } },
    },
  );

type Group = Resource<{
  name: string;
  isInternalGroup: boolean;
  publicLinkEnabled: boolean;
  publicLink: string | null;
}>;
let group = (await get<Group[]>(`/v1/apps/${app.id}/betaGroups`)).find(
  (g) => g.attributes.name === GROUP && !g.attributes.isInternalGroup,
);
if (!group) {
  group = (
    await api<{ data: Group }>("POST", "/v1/betaGroups", {
      data: { type: "betaGroups", attributes: { name: GROUP, feedbackEnabled: true }, ...appLink },
    })
  ).data;
  console.log(`Created the ${GROUP} group.`);
}
await api("POST", `/v1/betaGroups/${group.id}/relationships/builds`, {
  data: [{ type: "builds", id: build.id }],
});

const [submission] = await get<Resource<{ betaReviewState: string }>[]>(
  `/v1/betaAppReviewSubmissions?filter[build]=${build.id}`,
);
const reviewState = submission
  ? submission.attributes.betaReviewState
  : (
      await api<{ data: Resource<{ betaReviewState: string }> }>(
        "POST",
        "/v1/betaAppReviewSubmissions",
        {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: { build: { data: { type: "builds", id: build.id } } },
          },
        },
      )
    ).data.attributes.betaReviewState;

// The link goes on once the group has a build. If Apple won't enable it yet (say, before
// the first review passes), the build is still submitted, and rerunning the TestFlight
// workflow for this build after approval turns it on.
if (!group.attributes.publicLinkEnabled) {
  try {
    group = (
      await api<{ data: Group }>("PATCH", `/v1/betaGroups/${group.id}`, {
        data: {
          type: "betaGroups",
          id: group.id,
          attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: false },
        },
      })
    ).data;
  } catch (error) {
    console.warn(
      `Couldn't turn on the public link yet: ${error instanceof Error ? error.message : error}`,
    );
  }
}

const summary = [
  `TestFlight: ${version} (${buildNumber}) is in the ${GROUP} group, beta review ${reviewState}.`,
  group.attributes.publicLink
    ? `Public link: ${group.attributes.publicLink}`
    : "The public link isn't on yet. Once review approves this build, run the TestFlight workflow for it again.",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
