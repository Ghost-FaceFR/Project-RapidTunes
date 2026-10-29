const LATEST_RELEASE_URL = "https://api.github.com/repos/Ghost-FaceFR/Project-RapidTunes/releases/latest";

function parseVersion(value) {
  return String(value ?? "")
    .replace(/^v/i, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function pickInstallerAsset(assets) {
  const candidates = (assets ?? []).filter((asset) => /\.(exe|msi)$/i.test(asset.name));
  return (
    candidates.find((asset) => /setup|install/i.test(asset.name)) ??
    candidates.find((asset) => /\.msi$/i.test(asset.name)) ??
    candidates[0] ??
    null
  );
}

/** Interroge GitHub et renvoie { version, notes, pageUrl, asset, available }. */
export async function checkForUpdate(currentVersion) {
  const response = await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (response.status === 404) {
    return { available: false, version: null, notes: "", pageUrl: null, asset: null };
  }
  if (!response.ok) {
    throw new Error(`GitHub a répondu ${response.status}.`);
  }
  const release = await response.json();
  const version = String(release.tag_name ?? "").replace(/^v/i, "");
  const asset = pickInstallerAsset(release.assets);
  return {
    available: isNewerVersion(version, currentVersion),
    version,
    notes: release.body ?? "",
    pageUrl: release.html_url ?? null,
    asset: asset ? { name: asset.name, url: asset.browser_download_url } : null
  };
}
