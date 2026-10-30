const RELEASES_URL = "https://api.github.com/repos/Ghost-FaceFR/Project-RapidTunes/releases";
const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

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

/**
 * Découpe le corps markdown d'une release en sections { title, items }.
 * Les titres (#, ##, ###) ouvrent une section, les puces (-, *) en sont les éléments.
 * Le texte hors puces est conservé comme élément pour ne rien perdre.
 */
export function parseReleaseNotes(body) {
  const sections = [];
  let current = null;
  const ensure = (title = "") => {
    if (!current) {
      current = { title, items: [] };
      sections.push(current);
    }
    return current;
  };
  for (const raw of String(body ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      current = { title: heading[1].replace(/[*_`]/g, "").trim(), items: [] };
      sections.push(current);
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    ensure().items.push((bullet ? bullet[1] : line).replace(/\*\*/g, "").trim());
  }
  return sections.filter((section) => section.items.length > 0);
}

/** Renvoie l'historique des versions publiées : [{ version, name, date, pageUrl, sections }]. */
export async function fetchChangelog(limit = 20) {
  const response = await fetch(`${RELEASES_URL}?per_page=${limit}`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!response.ok) {
    throw new Error(`GitHub a répondu ${response.status}.`);
  }
  const releases = await response.json();
  return releases
    .filter((release) => !release.draft)
    .map((release) => ({
      version: String(release.tag_name ?? "").replace(/^v/i, ""),
      name: release.name ?? "",
      date: release.published_at ?? release.created_at ?? null,
      prerelease: Boolean(release.prerelease),
      pageUrl: release.html_url ?? null,
      sections: parseReleaseNotes(release.body)
    }));
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
