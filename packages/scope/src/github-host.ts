/**
 * Concrete GitHub.com ports, using Web-only REST and smart Git HTTP.
 * Configuration is supplied by the caller; this module deploys nothing.
 * Creation authority, read credentials, cleanup custody and the local handle
 * mapping require owner-approved configuration. A local handle is not a
 * GitHub-issued token ID. No plaintext is recorded in an outside answer.
 */
import type { RetainedInput } from "@generalbusiness/artroom-contract";
import { canonicalize, hex, utf8 } from "@generalbusiness/artroom-bytes";
import { byteOrder, valueDigest } from "@generalbusiness/artroom-derive";
import { DESTINATION_CHANGED_SET, type DestinationObject, type JudgeChanges, type RecordedJudgeEvidence, type TreeLink } from "@generalbusiness/artroom-platform";
import { GitRefusal, READ_BOUNDS, SNAPSHOT_BOUNDS, Reader, objectId, refName, type GitSource, type ReadBounds, type StoredObject } from "@generalbusiness/artroom-git";
import { GitHubApp, type GitHubAppOptions, type GitHubInstallationToken } from "@generalbusiness/artroom-git/github";
import { SmartHttpGit, type RawGitObject, type SmartHttpOptions } from "@generalbusiness/artroom-git/http";
import { SmartHttpSource } from "@generalbusiness/artroom-git/http-read";
import type { DestinationBinding, DestinationInspection, DestinationProvider, DestinationRepository } from "./destination-host.ts";
import type { RegisterProvider } from "./register-host.ts";

export interface GitHubProviderOptions {
  app: GitHubAppOptions;
  host: string;
  namespace: string;
  /** Caller-chosen transport allowance, not a platform quota. */
  maxBytes: number;
  bounds?: ReadBounds;
  /** Independently held read credential; undefined explicitly selects public reads. No mint occurs on a read. */
  readCredential(repository: DestinationRepository): Promise<string | undefined>;
  /** Caller's nonsecret, durable credential mapping, allocated BEFORE mint. Not a GitHub token ID. */
  credentialHandle(repository: DestinationRepository, binding: DestinationBinding): Promise<string>;
  /** Separate configured creation authority. No default broad credential. */
  creation?: { plaintext: string; private: boolean };
  /** Exact sealed creation name and already durably held, ID-scoped cleanup token. No mint occurs inside delete. */
  cleanupRepository?(id: string): Promise<{ name: string; token: GitHubInstallationToken } | null>;
  /** Resolve a recorded local credential handle from durable private custody. */
  cleanupCredential?(id: string): Promise<string | null>;
}
const bad = (): never => { throw new GitRefusal("unreadable", "GitHub provider"); };
const numericId = (value: string): number => {
  const id = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(id) || String(id) !== value) return bad();
  return id;
};
const handle = (value: string): string => {
  if (typeof value !== "string" || value.length === 0 || utf8(value).length > 256 || /[\u0000-\u001f\u007f]/.test(value)) return bad();
  return value;
};
// GitHub's documented installation-token Git credentials: username
// x-access-token and token password, encoded only in the Authorization header.
// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
const gitAuthorization = (plaintext: string): string => {
  if (!/^[A-Za-z0-9_.-]{1,4096}$/.test(plaintext)) return bad();
  return `Basic ${btoa(`x-access-token:${plaintext}`)}`;
};

export class GitHubProvider implements RegisterProvider, DestinationProvider {
  readonly #options: GitHubProviderOptions;
  readonly #app: GitHubApp;
  readonly #bounds: ReadBounds;
  constructor(options: GitHubProviderOptions) {
    if (options.namespace !== options.app.account.login || options.host !== "github.com" || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 32) bad();
    this.#options = { ...options, app: { ...options.app, account: { ...options.app.account } }, ...(options.creation === undefined ? {} : { creation: { ...options.creation } }) };
    this.#app = new GitHubApp(this.#options.app);
    this.#bounds = { ...(options.bounds ?? READ_BOUNDS) };
  }

  /** Deployment/bootstrap must establish the configured installation account. */
  validateInstallation(): Promise<void> { return this.#app.validateInstallation(); }

  async createRepository(name: string): Promise<unknown> {
    const configured = this.#options.creation;
    if (!configured) return null;
    try {
      const created = await this.#app.createRepository(name, { private: configured.private }, configured.plaintext);
      return { created: true, name, id: String(created.id) };
    } catch { return null; } // Never infer nameExists or refusal from a generic API error.
  }
  async deleteRepository(id: string, name: string): Promise<unknown> {
    try {
      const repositoryId = numericId(id);
      const cleanup = await this.#options.cleanupRepository?.(id);
      if (!cleanup || cleanup.name !== name) return null;
      await this.#app.deleteRepository(cleanup.name, repositoryId, cleanup.token);
      return { deleted: true, id };
    } catch { return null; }
  }
  async revokeCredential(id: string): Promise<unknown> {
    try {
      const plaintext = await this.#options.cleanupCredential?.(handle(id));
      if (!plaintext) return null;
      await this.#app.revokeToken(plaintext);
      return { revoked: true, credential: id };
    } catch { return null; }
  }

  async mint(repository: DestinationRepository, binding: DestinationBinding): Promise<unknown> {
    repository = { ...repository };
    binding = { ...binding, scope: { ...binding.scope } };
    this.#remote(repository);
    const id = handle(await this.#options.credentialHandle({ ...repository }, { ...binding, scope: { ...binding.scope } }));
    const token = await this.#app.mintInstallationToken({ repositoryIds: [numericId(repository.id)], permissions: { contents: "write" } });
    // DestinationHost puts the plaintext in private custody before answering.
    // Lost replies or failed custody remain pending; this port never remints.
    return { id, ends: token.expiresAt, plaintext: token.plaintext };
  }
  async revoke(id: string, plaintext: string): Promise<unknown> {
    handle(id);
    await this.#app.revokeToken(plaintext);
    return { revoked: true, id };
  }
  async format(repository: DestinationRepository): Promise<"sha1"> {
    const source = await this.#source(repository);
    // The actual complete Git advertisement is checked; the source rejects
    // SHA-256 and implements Git's implicit SHA-1 format when none is stated.
    await source.refs("refs/heads/", this.#bounds.refs);
    return "sha1";
  }
  async ref(repository: DestinationRepository, ref: string): Promise<string | null> {
    return new Reader(await this.#source(repository), this.#bounds).ref(ref);
  }
  async objects(repository: DestinationRepository, commit: string): Promise<readonly DestinationObject[]> {
    const source = await this.#source(repository);
    const collected = new Map<string, DestinationObject>();
    const recording: GitSource = {
      object: async (id, limit) => {
        const object = await source.object(id, limit);
        if (object.data !== null && (object.type === "blob" || object.type === "tree" || object.type === "commit")) collected.set(id, { id, kind: object.type, body: new Uint8Array(object.data) });
        return object;
      },
      ref: (ref) => source.ref(ref), refs: (prefix, limit) => source.refs(prefix, limit),
    };
    if (!(await new Reader(recording, this.#bounds).closure(commit)).complete) return bad();
    return [...collected.values()];
  }
  async send(request: Parameters<DestinationProvider["send"]>[0]): Promise<unknown> {
    request = { ...request, repository: { ...request.repository }, binding: { ...request.binding, scope: { ...request.binding.scope } } };
    const remote = this.#remote(request.repository);
    return sendOnce(request, { ...this.#transport(remote), authorization: gitAuthorization(request.token) }, () => this.ref(request.repository, request.ref));
  }
  async inspect(context: DestinationInspection): Promise<{ evidence: RecordedJudgeEvidence; retain?: readonly RetainedInput[] }> {
    context = { ...context, repository: { ...context.repository }, reports: [...context.reports] };
    return inspectGit(new Reader(await this.#source(context.repository), this.#bounds), context, this.#bounds);
  }

  #remote(repository: DestinationRepository): string {
    if (repository.host !== this.#options.host || repository.namespace !== this.#options.namespace || !/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name) || repository.name === "." || repository.name === ".." || repository.name.toLowerCase().endsWith(".git")) return bad();
    numericId(repository.id);
    return `https://github.com/${this.#options.namespace}/${repository.name}.git`;
  }
  #transport(remote: string) {
    return { remote, maxBytes: this.#options.maxBytes, bounds: this.#bounds, ...(this.#options.app.fetch === undefined ? {} : { fetch: this.#options.app.fetch }), ...(this.#options.app.timeoutMs === undefined ? {} : { timeoutMs: this.#options.app.timeoutMs }) };
  }
  async #source(repository: DestinationRepository): Promise<SmartHttpSource> {
    repository = { ...repository };
    const remote = this.#remote(repository);
    const plaintext = await this.#options.readCredential({ ...repository });
    // Lookup validates the configured account and the recorded stable ID.
    // A missing/unexposed lookup is uncertainty, never an absent Git object.
    const seen = await this.#app.repository(repository.name, plaintext);
    if (seen === null || seen.id !== numericId(repository.id)) return bad();
    return new SmartHttpSource({ ...this.#transport(remote), ...(plaintext === undefined ? {} : { authorization: gitAuthorization(plaintext) }) });
  }
}

/**
 * The one push of a destination write: the supplied objects are checked for
 * closure, parent and tree before one compare-and-swap through the smart-HTTP
 * receive-pack client. Only the push's own whole answer, confirmed by the
 * read-back, is "accepted". An applied ref cannot settle a lost or incomplete
 * own answer. Nothing is retried.
 */
export async function sendOnce(request: Parameters<DestinationProvider["send"]>[0], transport: SmartHttpOptions, readBack: () => Promise<string | null>): Promise<unknown> {
  const bounds = transport.bounds ?? READ_BOUNDS;
  const objects: RawGitObject[] = request.objects.map((object) => ({ id: object.id, type: object.kind, data: new Uint8Array(object.body) }));
  const supplied = new Map(objects.map((object) => [object.id, object]));
  if (supplied.size !== objects.length || objects.reduce((size, object) => size + object.data.length, 0) > transport.maxBytes) return bad();
  const source: GitSource = {
    object: async (id): Promise<StoredObject | null> => {
      const object = supplied.get(id);
      return object ? { type: object.type, size: object.data.length, data: new Uint8Array(object.data) } : null;
    },
    ref: async () => bad(), refs: async () => bad(),
  };
  const reader = new Reader(source, bounds);
  const commit = await reader.commit(request.commit);
  if ((request.old !== null && commit.parents[0] !== request.old) || (request.requireParentless && commit.parents.length !== 0) || (request.expectedTree !== undefined && commit.tree !== request.expectedTree)) return bad();
  const stop = request.old === null ? new Set<string>() : new Set([objectId(request.old, "old")]);
  if (!(await reader.closure(request.commit, stop)).complete) return bad();
  const result = await new SmartHttpGit(transport).send({ ref: request.ref, old: request.old, new: request.commit, objects, beforeSend: request.allowed });
  if (!result.ran || result.reported === "stale") return { send: "not-sent" };
  if (result.exit === 1 && result.reported === "remote-rejected" && !result.timedOut) return { send: "refused" };
  if (result.exit === 0 && (result.reported === "created" || result.reported === "updated") && !result.timedOut && await readBack() === request.commit) return { send: "accepted" };
  return null; // An applied ref cannot settle a lost or incomplete own answer.
}

interface FlatFile { id: string; mode: string; path: string | null }
interface FlatTree { files: Map<string, FlatFile>; directories: Set<string> }
const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
async function flatTree(reader: Reader, tree: string): Promise<FlatTree> {
  const files = new Map<string, FlatFile>();
  const directories = new Set([""]);
  let trees = 0;
  const walk = async (id: string, prefix: Uint8Array, depth: number): Promise<void> => {
    if (++trees > SNAPSHOT_BOUNDS.trees || depth >= SNAPSHOT_BOUNDS.depth) return bad();
    for (const entry of await reader.tree(id)) {
      const path = new Uint8Array(prefix.length + (prefix.length > 0 ? 1 : 0) + entry.name.length);
      path.set(prefix);
      if (prefix.length > 0) path[prefix.length] = 47;
      path.set(entry.name, prefix.length + (prefix.length > 0 ? 1 : 0));
      if (path.length > SNAPSHOT_BOUNDS.pathBytes || entry.kind === "gitlink") return bad();
      let text: string | null = null;
      try { text = strict.decode(path); } catch { /* Raw path remains identified and counted. */ }
      if (entry.kind === "tree") {
        if (text !== null) directories.add(text);
        await walk(entry.id, path, depth + 1);
      } else {
        if (files.size >= SNAPSHOT_BOUNDS.files) return bad();
        files.set(hex(path), { id: entry.id, mode: entry.mode, path: text });
      }
    }
  };
  await walk(tree, new Uint8Array(), 0);
  return { files, directories };
}

/** Whole-tree symbolic-link resolution, including directory links and cycles. */
async function resolveLink(reader: Reader, path: string, files: Map<string, FlatFile>, directories: Set<string>): Promise<readonly string[] | null> {
  const first = files.get(path);
  if (!first) return null;
  let target: string;
  const firstBytes = await reader.blob(first.id);
  try { target = strict.decode(firstBytes); } catch { return null; }
  if (firstBytes.length > SNAPSHOT_BOUNDS.pathBytes) return bad();
  if (target === "" || target.startsWith("/") || target.includes("\0")) return null;
  const reached: string[] = [];
  // The links whose expansion is still under way, each with how many components follow its target. A link that is reached again
  // while it is on this stack is a cycle; one reached again after its target was consumed (as in `alias/../alias/x`) is not.
  const expanding: { link: string; after: number }[] = [{ link: path, after: 0 }];
  const at = path.split("/").slice(0, -1);
  let remaining = target.split("/");
  let next = 0;
  for (let steps = 0; next < remaining.length; steps++) {
    // A work bound is uncertainty, never proof that a resolvable link is broken.
    if (steps > SNAPSHOT_BOUNDS.pathBytes * (DESTINATION_CHANGED_SET.links + 1)) return bad();
    while (expanding.length > 0 && remaining.length - next <= expanding[expanding.length - 1]!.after) expanding.pop();
    const component = remaining[next++]!;
    if (component === "" || component === ".") continue;
    if (component === "..") { if (at.length === 0) return null; at.pop(); continue; }
    const candidate = [...at, component].join("/");
    const file = files.get(candidate);
    if (file?.mode === "120000") {
      if (expanding.some((open) => open.link === candidate)) return null;
      expanding.push({ link: candidate, after: remaining.length - next });
      reached.push(candidate);
      const bytes = await reader.blob(file.id);
      try { target = strict.decode(bytes); } catch { return null; }
      if (bytes.length > SNAPSHOT_BOUNDS.pathBytes) return bad();
      if (target === "" || target.startsWith("/") || target.includes("\0")) return null;
      remaining = [...target.split("/"), ...remaining.slice(next)];
      next = 0;
    } else {
      if (!directories.has(candidate) && !file) return null;
      if (next < remaining.length && !directories.has(candidate)) return null;
      at.push(component);
    }
  }
  reached.push(at.join("/"));
  return reached;
}

/** Host facts only. No reservation or rules judgment is performed here. */
export async function inspectGit(reader: Reader, context: DestinationInspection, bounds: ReadBounds = READ_BOUNDS): Promise<{ evidence: RecordedJudgeEvidence; retain?: readonly RetainedInput[] }> {
  context = { ...context, repository: { ...context.repository }, reports: [...context.reports] };
  const head = await reader.ref(refName(context.ref, "inspection ref"));
  const integration = await reader.commit(context.integration);
  // A denied/malformed/missing closure supplies no false present:false fact.
  if (!(await reader.closure(context.integration)).complete || !(await reader.closure(context.base)).complete) return bad();
  const base = await reader.commit(context.base);
  const seen = new Set([integration.id]);
  const todo = [...integration.parents];
  for (let id = todo.pop(); id !== undefined; id = todo.pop()) {
    if (seen.has(id)) continue;
    if (seen.size >= bounds.closureObjects) return bad();
    seen.add(id);
    todo.push(...(await reader.commit(id)).parents);
  }
  const evidence: RecordedJudgeEvidence = { head, present: true, tree: integration.tree, firstParent: integration.parents[0] ?? null, ancestors: [...new Set(context.reports.filter((id) => seen.has(objectId(id, "report"))))], changes: null };
  const [old, next] = await Promise.all([flatTree(reader, base.tree), flatTree(reader, integration.tree)]);
  const paths: string[] = [];
  let unreadable = 0;
  let changed = 0;
  for (const key of new Set([...old.files.keys(), ...next.files.keys()])) {
    const before = old.files.get(key);
    const after = next.files.get(key);
    if (before?.id === after?.id && before?.mode === after?.mode) continue;
    if (++changed > DESTINATION_CHANGED_SET.paths) return { evidence: { ...evidence, changes: { over: "paths" } } };
    const path = after?.path ?? before?.path ?? null;
    if (path === null) unreadable++;
    else paths.push(path);
  }
  paths.sort(byteOrder);
  const textual = (tree: FlatTree): Map<string, FlatFile> => new Map([...tree.files.values()].flatMap((file) => file.path === null ? [] : [[file.path, file] as const]));
  const oldFiles = textual(old);
  const newFiles = textual(next);
  const linkNames = [...new Set([...oldFiles, ...newFiles].flatMap(([path, file]) => file.mode === "120000" ? [path] : []))].sort(byteOrder);
  if (linkNames.length > DESTINATION_CHANGED_SET.links) return { evidence: { ...evidence, changes: { over: "links" } } };
  const links: TreeLink[] = [];
  for (const path of linkNames) {
    const before = oldFiles.get(path);
    const after = newFiles.get(path);
    const left = before?.mode === "120000" ? await resolveLink(reader, path, oldFiles, old.directories) : undefined;
    const right = after?.mode === "120000" ? await resolveLink(reader, path, newFiles, next.directories) : undefined;
    if (left !== undefined && right !== undefined && before?.id === after?.id && canonicalize(left) === canonicalize(right)) links.push({ path, tree: "both", resolves: left });
    else {
      if (left !== undefined) links.push({ path, tree: "old", resolves: left });
      if (right !== undefined) links.push({ path, tree: "new", resolves: right });
    }
    if (links.length > DESTINATION_CHANGED_SET.links) return { evidence: { ...evidence, changes: { over: "links" } } };
  }
  const changes: JudgeChanges = { paths, links, unreadable };
  const bytes = canonicalize(changes);
  if (utf8(bytes).length > DESTINATION_CHANGED_SET.max) return { evidence: { ...evidence, changes: { over: "bytes" } } };
  const digest = valueDigest(DESTINATION_CHANGED_SET.domain, changes);
  return { evidence: { ...evidence, changes: digest }, retain: [{ kind: "value", domain: DESTINATION_CHANGED_SET.domain, digest, bytes }] };
}
