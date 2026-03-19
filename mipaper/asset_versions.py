from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path


JS_REFERENCE_PATTERN = re.compile(
    r'(?P<prefix>\bfrom\s+["\']|\bimport\s+["\']|src=["\'])'
    r'(?P<path>\./[^"\']+?\.js(?:\?[^"\']*)?)'
    r'(?P<suffix>["\'])'
)


@dataclass(frozen=True)
class AssetVersionUpdateResult:
    updated_files: tuple[Path, ...]


def update_site_asset_versions(site_dir: Path) -> AssetVersionUpdateResult:
    site_root = site_dir.resolve()
    js_files = sorted(site_root.glob("*.js"))
    target_versions = {path.resolve(): compute_asset_version(path) for path in js_files}

    updated_files: list[Path] = []
    for path in sorted([*site_root.glob("*.js"), *site_root.glob("*.html")]):
        text = path.read_text(encoding="utf-8")
        rewritten = rewrite_js_references(text, source_path=path, site_root=site_root, target_versions=target_versions)
        if rewritten == text:
            continue
        path.write_text(rewritten, encoding="utf-8")
        updated_files.append(path)

    return AssetVersionUpdateResult(updated_files=tuple(updated_files))


def compute_asset_version(path: Path) -> str:
    normalized_text = strip_local_js_versions(path.read_text(encoding="utf-8"))
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()[:10]


def strip_local_js_versions(text: str) -> str:
    return JS_REFERENCE_PATTERN.sub(lambda match: f"{match.group('prefix')}{strip_version(match.group('path'))}{match.group('suffix')}", text)


def rewrite_js_references(text: str, *, source_path: Path, site_root: Path, target_versions: dict[Path, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        raw_path = match.group("path")
        base_path = strip_version(raw_path)
        target_path = (source_path.parent / base_path).resolve()
        if not str(target_path).startswith(str(site_root)):
            raise ValueError(f"Asset reference escapes site root: {raw_path} in {source_path}")
        if target_path not in target_versions:
            raise FileNotFoundError(f"Referenced asset not found for versioning: {raw_path} in {source_path}")
        versioned_path = f"{base_path}?v={target_versions[target_path]}"
        return f"{match.group('prefix')}{versioned_path}{match.group('suffix')}"

    return JS_REFERENCE_PATTERN.sub(replace, text)


def strip_version(path: str) -> str:
    return path.split("?", 1)[0]
