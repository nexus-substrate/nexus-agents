#!/usr/bin/env python3
"""One-shot #7629 source freeze. Run python3 -I -S <this file> --check.

Host Python, Git and runner are trusted. No project code is imported. Literal
bytes and executable modes are required: no checkout normalization, symlinks,
gitlinks or non-UTF8/control-character paths. This is equality, not source safety.
Ordinary merges invalidate only manual canary readiness, never ordinary CI.
--write authors a local candidate; it grants no ratification or activation.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import time

MANIFEST = "governance/native-approval-canary-source-snapshot.json"
LEDGER = "governance/vote-records.jsonl"
EXCLUDED = [MANIFEST, LEDGER]
REPORT = ".nexus-agents/native-approval-canary/source-snapshot.json"
MAX_ROWS = 20000
MAX_OUTPUT = 16000000
MAX_FILE = 32000000
MAX_TOTAL = 512000000
START = time.monotonic()


class Refusal(Exception):
    def __init__(self, reason, path=None):
        self.reason, self.path = reason, path


def require(condition, reason, path=None):
    if not condition:
        raise Refusal(reason, path)


def git(root, args, data=b""):
    """Bound stdout while reading; never invoke a shell or Git write/filter path."""
    require(time.monotonic() - START < 120, "source-time-limit")
    process = None
    try:
        process = subprocess.Popen(
            ["git", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", *args],
            cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        output = bytearray()
        pending = memoryview(data)
        deadline = min(START + 120, time.monotonic() + 15)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            if pending:
                selector.register(process.stdin, selectors.EVENT_WRITE)
            else:
                process.stdin.close()
            while selector.get_map():
                remaining = deadline - time.monotonic()
                require(remaining > 0, "git-time-limit")
                for key, _ in selector.select(min(remaining, 0.25)):
                    if key.fileobj is process.stdin:
                        sent = os.write(process.stdin.fileno(), pending[:4096])
                        pending = pending[sent:]
                        if not pending:
                            selector.unregister(process.stdin)
                            process.stdin.close()
                    else:
                        chunk = os.read(process.stdout.fileno(), 65536)
                        if not chunk:
                            selector.unregister(process.stdout)
                        output.extend(chunk)
                        require(len(output) <= MAX_OUTPUT, "git-output-limit")
        require(process.wait(timeout=max(0.01, deadline-time.monotonic())) == 0,
                "git-command-failed")
        return bytes(output)
    except FileNotFoundError:
        raise Refusal("git-unavailable") from None
    except (OSError, subprocess.SubprocessError):
        raise Refusal("git-command-unavailable") from None
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            if not process.stdin.closed:
                process.stdin.close()


def nul_rows(raw):
    require(bool(raw) and raw.endswith(b"\0"), "git-rows-empty-or-truncated")
    rows = raw[:-1].split(b"\0")
    require(0 < len(rows) <= MAX_ROWS, "source-row-limit")
    return rows


def path_text(raw):
    try:
        path = raw.decode("utf-8", errors="strict")
    except UnicodeError:
        raise Refusal("unsupported-source-path") from None
    require(0 < len(raw) <= 1024 and not any(ord(c) < 32 or ord(c) == 127 for c in path)
            and "\\" not in path and not path.startswith("/")
            and all(part not in ("", ".", "..", ".git") for part in path.split("/")),
            "unsupported-source-path")
    return path


def index_rows(root, oid_length):
    result = {}
    for row in nul_rows(git(root, ["ls-files", "--stage", "-z"])):
        require(b"\t" in row, "index-row-malformed")
        header, raw = row.split(b"\t", 1)
        require(re.fullmatch(rb"(100644|100755|120000|160000) [0-9a-f]{" +
                             str(oid_length).encode() + rb"} [0-3]", header) is not None,
                "index-row-malformed")
        mode, oid, stage = header.decode("ascii").split(" ")
        require(stage == "0", "index-conflicted")
        path = path_text(raw)
        require(path not in result, "index-path-duplicate", path)
        require(mode in ("100644", "100755"), "unsupported-source-mode", path)
        result[path] = (mode, oid)
    return result


def head_rows(root, oid_length):
    result = {}
    for row in nul_rows(git(root, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"])):
        require(b"\t" in row, "tree-row-malformed")
        header, raw = row.split(b"\t", 1)
        require(re.fullmatch(rb"(100644|100755) blob [0-9a-f]{" +
                             str(oid_length).encode() + rb"}", header) is not None,
                "unsupported-tree-row")
        mode, _, oid = header.decode("ascii").split(" ")
        path = path_text(raw)
        require(path not in result, "tree-path-duplicate", path)
        result[path] = (mode, oid)
    return result


def regular_file(root, path, mode):
    file = root / path
    for parent in [file, *list(file.parents)[:len(Path(path).parts)-1]]:
        require(not parent.is_symlink(), "source-symlink", path)
    info = file.lstat()
    require(stat.S_ISREG(info.st_mode), "unsupported-source-mode", path)
    actual = "100755" if info.st_mode & 0o111 else "100644"
    require(actual == mode, "source-mode-mismatch", path)
    require(info.st_size <= MAX_FILE, "source-file-size-limit", path)
    with file.open("rb") as stream:
        data = stream.read(MAX_FILE + 1)
    require(len(data) <= MAX_FILE, "source-file-size-limit", path)
    return data


def source_digest(root, index):
    paths = sorted(path for path in index if path not in EXCLUDED)
    require(bool(paths), "source-empty")
    total = 0
    records = []
    for start in range(0, len(paths), 32):
        batch = paths[start:start+32]
        hashes = []
        for path in batch:
            data = regular_file(root, path, index[path][0])
            total += len(data)
            require(total <= MAX_TOTAL, "source-total-size-limit")
            hashes.append(hashlib.sha256(data).hexdigest())
        # './' prevents Git's quoted-path interpretation. Control bytes refused above.
        try:
            raw = git(root, ["hash-object", "--no-filters", "--stdin-paths"],
                      b"".join(("./" + path + "\n").encode("utf-8") for path in batch))
        except Refusal as error:
            if error.reason in ("git-command-failed", "git-command-unavailable"):
                raise Refusal("git-literal-hash-unavailable") from None
            raise
        oids = raw.splitlines()
        require(len(oids) == len(batch), "git-hash-output-malformed")
        for path, oid, sha in zip(batch, oids, hashes):
            require(oid == index[path][1].encode("ascii"), "raw-bytes-index-mismatch", path)
            records.append([index[path][0], path, sha])
    encoded = json.dumps(records, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    return len(records), hashlib.sha256(encoded).hexdigest()


def read_manifest(root):
    try:
        require(not (root / MANIFEST).is_symlink(), "manifest-symlink")
        raw = (root / MANIFEST).read_bytes()
        require(0 < len(raw) <= 16384, "manifest-size-invalid")
        value = json.loads(raw)
    except (OSError, ValueError):
        raise Refusal("manifest-unmeasured") from None
    keys = {"version", "scope", "baseTreeSha", "objectFormat", "excludedPaths",
            "sourceFileCount", "sourceSha256"}
    require(isinstance(value, dict) and set(value) == keys, "manifest-malformed")
    require(type(value["version"]) is int and value["version"] == 1
            and value["scope"] == "one-shot-7629-canary-readiness-only"
            and value["excludedPaths"] == EXCLUDED, "manifest-malformed")
    require(type(value["sourceFileCount"]) is int and 0 < value["sourceFileCount"] <= MAX_ROWS,
            "manifest-empty")
    require(isinstance(value["sourceSha256"], str) and
            re.fullmatch("[0-9a-f]{64}", value["sourceSha256"]), "manifest-hash-invalid")
    require(value["objectFormat"] in ("sha1", "sha256") and
            isinstance(value["baseTreeSha"], str) and
            re.fullmatch("[0-9a-f]{" + str(40 if value["objectFormat"] == "sha1" else 64) + "}",
                         value["baseTreeSha"]), "manifest-tree-invalid")
    return value, hashlib.sha256(raw).hexdigest()


def measure(root, write, record):
    require(git(root, ["rev-parse", "--show-toplevel"]).rstrip(b"\n") == os.fsencode(root),
            "checkout-root-mismatch")
    format_ = git(root, ["rev-parse", "--show-object-format"]).strip().decode("ascii")
    require(format_ in ("sha1", "sha256"), "unsupported-object-format")
    size = 40 if format_ == "sha1" else 64
    tree = git(root, ["rev-parse", "--verify", "HEAD^{tree}"]).strip().decode("ascii")
    require(re.fullmatch("[0-9a-f]{"+str(size)+"}", tree), "head-tree-invalid")
    index = index_rows(root, size)
    require(set(EXCLUDED).issubset(index), "exclusion-path-missing")
    # Even passive excluded files must retain regular-file modes.
    for path in EXCLUDED:
        regular_file(root, path, index[path][0])
    if not write:
        manifest, manifest_hash = read_manifest(root)
        record.update(authoredBaseTree=manifest["baseTreeSha"], manifestSha256=manifest_hash)
        require(manifest["objectFormat"] == format_, "object-format-mismatch")
        head = head_rows(root, size)
        source_index = {p: v for p, v in index.items() if p not in EXCLUDED}
        source_head = {p: v for p, v in head.items() if p not in EXCLUDED}
        require(source_index == source_head, "index-head-mismatch")
        extra = git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
        ignored = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])
        require(not extra, "untracked-source-present")
        require(not ignored, "ignored-source-present")
    count, digest = source_digest(root, index)
    record.update(sourceFileCount=count, sourceSha256=digest)
    if write:
        value = {"version": 1, "scope": "one-shot-7629-canary-readiness-only",
                 "baseTreeSha": tree, "objectFormat": format_, "excludedPaths": EXCLUDED,
                 "sourceFileCount": count, "sourceSha256": digest}
        (root / MANIFEST).write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")
        record["status"] = "candidate-written"
    else:
        require(manifest["sourceFileCount"] == count and manifest["sourceSha256"] == digest,
                "snapshot-stale")
        record.update(status="verified", complete=True)


def persist(root, record):
    for path in (root / ".nexus-agents", root / ".nexus-agents/native-approval-canary"):
        require(not path.is_symlink(), "report-path-symlink")
        path.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(root / REPORT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(json.dumps(record, sort_keys=True)+"\n")


def main():
    root = Path.cwd().resolve()
    record = {"status": "refused", "complete": False, "writeAttempted": False,
              "scope": "one-shot-7629-canary-readiness-only"}
    write = sys.argv[1:] == ["--write"]
    try:
        require(sys.argv[1:] in (["--check"], ["--write"]), "invalid-invocation")
        require(not write or ("CI" not in os.environ and "GITHUB_ACTIONS" not in os.environ),
                "authoring-in-ci-refused")
        require(not os.environ.get("GH_TOKEN") and not os.environ.get("GITHUB_TOKEN"),
                "credentials-exposed-before-snapshot")
        measure(root, write, record)
    except Refusal as error:
        record["reason"] = error.reason
        if error.path is not None:
            record["path"] = error.path
    except (OSError, ValueError, TypeError, KeyError, UnicodeError):
        record["reason"] = "snapshot-unmeasured"
    if not write:
        try:
            persist(root, record)
        except (OSError, Refusal):
            record.update(status="refused", complete=False, reason="snapshot-record-unavailable")
    print(json.dumps(record, sort_keys=True))
    return 0 if record["status"] in ("verified", "candidate-written") else 1


if __name__ == "__main__":
    sys.exit(main())
