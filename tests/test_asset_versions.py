from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from mipaper.asset_versions import compute_asset_version, update_site_asset_versions


class AssetVersionsTest(unittest.TestCase):
    def test_update_site_asset_versions_rewrites_html_and_js_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            site_dir = Path(tmpdir) / "site"
            site_dir.mkdir(parents=True)

            (site_dir / "a.js").write_text("export const value = 1;\n", encoding="utf-8")
            (site_dir / "b.js").write_text('import { value } from "./a.js?v=old";\nconsole.log(value);\n', encoding="utf-8")
            (site_dir / "c.js").write_text('import { value } from "./a.js";\nconsole.log(value);\n', encoding="utf-8")
            (site_dir / "index.html").write_text(
                '<script type="module" src="./b.js?v=stale"></script>\n<script type="module" src="./c.js"></script>\n',
                encoding="utf-8",
            )

            result = update_site_asset_versions(site_dir)

            a_version = compute_asset_version(site_dir / "a.js")
            b_version = compute_asset_version(site_dir / "b.js")
            c_version = compute_asset_version(site_dir / "c.js")

            self.assertEqual(
                {
                    (site_dir / "b.js").resolve(),
                    (site_dir / "c.js").resolve(),
                    (site_dir / "index.html").resolve(),
                },
                {path.resolve() for path in result.updated_files},
            )
            self.assertIn(f'from "./a.js?v={a_version}"', (site_dir / "b.js").read_text(encoding="utf-8"))
            self.assertIn(f'from "./a.js?v={a_version}"', (site_dir / "c.js").read_text(encoding="utf-8"))

            html = (site_dir / "index.html").read_text(encoding="utf-8")
            self.assertIn(f'src="./b.js?v={b_version}"', html)
            self.assertIn(f'src="./c.js?v={c_version}"', html)

    def test_compute_asset_version_ignores_existing_version_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            asset_path = Path(tmpdir) / "page.js"
            asset_path.write_text('import "./dep.js?v=one";\nconsole.log("ready");\n', encoding="utf-8")
            first = compute_asset_version(asset_path)

            asset_path.write_text('import "./dep.js?v=two";\nconsole.log("ready");\n', encoding="utf-8")
            second = compute_asset_version(asset_path)

            self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
