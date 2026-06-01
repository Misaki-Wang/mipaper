from pathlib import Path
import unittest


class BuildSiteDataScriptTest(unittest.TestCase):
    def test_branch_catalog_includes_trending_manifest(self) -> None:
        script = Path("scripts/build_site_data.py").read_text(encoding="utf-8")

        self.assertIn("trending_result.manifest", script)


if __name__ == "__main__":
    unittest.main()
