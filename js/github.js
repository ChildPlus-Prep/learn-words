// Talks to the GitHub API from the browser.
// Every change (images + sound + catalog.json) is saved as ONE commit,
// so an item is never half-added if something fails midway.

const API = "https://api.github.com";
const CATALOG_PATH = "data/catalog.json";

export class GitHubRepo {
  constructor({ owner, repo, branch, token }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || "main";
    this.token = token;
  }

  async req(path, options = {}) {
    const res = await fetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message || message;
      } catch {}
      const err = new Error(`GitHub ${res.status}: ${message}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  // Checks the token works and can write to this repo.
  async checkAccess() {
    const info = await this.req("");
    if (info.permissions && !info.permissions.push) {
      throw new Error("This token can read the repo but can't write to it.");
    }
    return info;
  }

  async readCatalog(ref = this.branch) {
    try {
      const file = await this.req(`/contents/${CATALOG_PATH}?ref=${encodeURIComponent(ref)}`);
      return JSON.parse(base64ToText(file.content));
    } catch (err) {
      if (err.status === 404) return { categories: [] };
      throw err;
    }
  }

  /**
   * Runs `mutate(catalog)` against the latest catalog and commits the result.
   * mutate can change the catalog in place and return
   *   { uploads: [{ path, blob }], deletes: [path] }
   * If someone else saved at the same moment, it starts over (up to 3 times).
   */
  async commit(message, mutate, onStatus = () => {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      onStatus("Reading the latest version…");
      const ref = await this.req(`/git/ref/heads/${this.branch}`);
      const headSha = ref.object.sha;
      const head = await this.req(`/git/commits/${headSha}`);
      const catalog = await this.readCatalog(headSha);
      catalog.categories ||= [];

      const { uploads = [], deletes = [] } = (await mutate(catalog)) || {};
      const tree = [];

      for (const { path, blob } of uploads) {
        onStatus(`Uploading ${path.split("/").pop()}…`);
        const created = await this.req("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: await blobToBase64(blob), encoding: "base64" }),
        });
        tree.push({ path, mode: "100644", type: "blob", sha: created.sha });
      }

      if (deletes.length) {
        // Only delete files that really exist, otherwise GitHub rejects the tree.
        const existing = await this.req(`/git/trees/${head.tree.sha}?recursive=1`);
        const paths = new Set(existing.tree.map((t) => t.path));
        const uploading = new Set(uploads.map((u) => u.path));
        for (const path of new Set(deletes)) {
          if (paths.has(path) && !uploading.has(path)) {
            tree.push({ path, mode: "100644", type: "blob", sha: null });
          }
        }
      }

      tree.push({
        path: CATALOG_PATH,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(catalog, null, 2) + "\n",
      });

      onStatus("Saving…");
      const newTree = await this.req("/git/trees", {
        method: "POST",
        body: JSON.stringify({ base_tree: head.tree.sha, tree }),
      });
      const newCommit = await this.req("/git/commits", {
        method: "POST",
        body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
      });

      try {
        await this.req(`/git/refs/heads/${this.branch}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: newCommit.sha, force: false }),
        });
        return { catalog, commit: newCommit };
      } catch (err) {
        if (err.status === 422 && attempt < 3) {
          onStatus("Someone else saved at the same time, trying again…");
          continue;
        }
        throw err;
      }
    }
  }
}

function base64ToText(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
