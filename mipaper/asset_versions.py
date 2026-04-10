from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


JS_REFERENCE_PATTERN = re.compile(
    r'(?P<prefix>\bfrom\s+["\']|\bimport\s+["\']|src=["\'])'
    r'(?P<path>(?:\./|\.\./)[^"\']+?\.js(?:\?[^"\']*)?)'
    r'(?P<suffix>["\'])'
)


@dataclass(frozen=True)
class AssetVersionUpdateResult:
    updated_files: tuple[Path, ...]


def update_site_asset_versions(site_dir: Path) -> AssetVersionUpdateResult:
    site_root = site_dir.resolve()
    target_versions = compute_site_asset_versions(site_root)

    updated_files: list[Path] = []
    for path in iter_site_files(site_root, suffixes={".html", ".js"}):
        text = path.read_text(encoding="utf-8")
        rewritten = rewrite_js_references(text, source_path=path, site_root=site_root, target_versions=target_versions)
        if rewritten == text:
            continue
        path.write_text(rewritten, encoding="utf-8")
        updated_files.append(path)

    return AssetVersionUpdateResult(updated_files=tuple(updated_files))


def compute_site_asset_versions(site_dir: Path) -> dict[Path, str]:
    site_root = site_dir.resolve()
    normalized_sources = {
        path.resolve(): strip_local_js_versions(path.read_text(encoding="utf-8"))
        for path in iter_site_files(site_root, suffixes={".js"})
    }
    base_versions = {
        path: hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]
        for path, text in normalized_sources.items()
    }
    target_versions: dict[Path, str] = {}
    visiting: set[Path] = set()

    def resolve_version(path: Path) -> str:
        target_path = path.resolve()
        if target_path in target_versions:
            return target_versions[target_path]
        if target_path in visiting:
            return base_versions[target_path]
        if target_path not in normalized_sources:
            raise FileNotFoundError(f"Referenced asset not found for versioning: {target_path}")

        visiting.add(target_path)
        try:
            normalized_text = normalized_sources[target_path]
            versioned_text = rewrite_js_references(
                normalized_text,
                source_path=target_path,
                site_root=site_root,
                target_versions=target_versions,
                resolve_version=resolve_version,
            )
            version = hashlib.sha256(versioned_text.encode("utf-8")).hexdigest()[:10]
            target_versions[target_path] = version
            return version
        finally:
            visiting.discard(target_path)

    for path in normalized_sources:
        resolve_version(path)

    return target_versions


def compute_asset_version(path: Path, *, site_dir: Path | None = None) -> str:
    if site_dir is not None:
        return compute_site_asset_versions(site_dir)[path.resolve()]

    normalized_text = strip_local_js_versions(path.read_text(encoding="utf-8"))
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()[:10]


def strip_local_js_versions(text: str) -> str:
    return JS_REFERENCE_PATTERN.sub(lambda match: f"{match.group('prefix')}{strip_version(match.group('path'))}{match.group('suffix')}", text)


def rewrite_js_references(
    text: str,
    *,
    source_path: Path,
    site_root: Path,
    target_versions: dict[Path, str],
    resolve_version: Callable[[Path], str] | None = None,
) -> str:
    def replace(match: re.Match[str]) -> str:
        raw_path = match.group("path")
        base_path = strip_version(raw_path)
        target_path = (source_path.parent / base_path).resolve()
        if not is_path_within_root(target_path, site_root):
            raise ValueError(f"Asset reference escapes site root: {raw_path} in {source_path}")
        if resolve_version is not None:
            version = resolve_version(target_path)
        else:
            if target_path not in target_versions:
                raise FileNotFoundError(f"Referenced asset not found for versioning: {raw_path} in {source_path}")
            version = target_versions[target_path]
        versioned_path = f"{base_path}?v={version}"
        return f"{match.group('prefix')}{versioned_path}{match.group('suffix')}"

    return JS_REFERENCE_PATTERN.sub(replace, text)


def iter_site_files(site_root: Path, *, suffixes: set[str]) -> list[Path]:
    return sorted(path for path in site_root.rglob("*") if path.is_file() and path.suffix in suffixes)


def is_path_within_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def strip_version(path: str) -> str:
    return path.split("?", 1)[0]
