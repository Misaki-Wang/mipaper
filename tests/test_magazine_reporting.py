import unittest

from mipaper.magazine_reporting import build_magazine_json_payload, parse_magazine_issue_markdown


SAMPLE_MAGAZINE_MARKDOWN = """# 科技爱好者周刊（第 390 期）：没有语料，大模型就是智障

这里记录每周值得分享的科技内容，周五发布。

本杂志[开源](https://github.com/ruanyf/weekly)，欢迎[投稿](https://github.com/ruanyf/weekly/issues)。

## 封面图

![](https://cdn.example.com/cover.webp)

这是一张封面图说明。

## 科技动态

1、[一个链接](https://example.com/post)

这是正文。
"""


class MagazineReportingTest(unittest.TestCase):
    def test_parse_magazine_issue_markdown_extracts_sections_and_excerpt(self) -> None:
        issue = parse_magazine_issue_markdown(
            SAMPLE_MAGAZINE_MARKDOWN,
            sync_date="2026-04-02",
            issue_number=390,
            source_url="https://github.com/ruanyf/weekly/blob/master/docs/issue-390.md",
            raw_url="https://raw.githubusercontent.com/ruanyf/weekly/master/docs/issue-390.md",
        )

        self.assertEqual("科技爱好者周刊（第 390 期）：没有语料，大模型就是智障", issue.issue_title)
        self.assertEqual("issue-390", issue.issue_slug)
        self.assertEqual("https://cdn.example.com/cover.webp", issue.cover_image_url)
        self.assertIn("这里记录每周值得分享的科技内容", issue.excerpt)
        self.assertNotIn("[开源]", issue.excerpt)
        self.assertEqual(2, len(issue.sections))
        self.assertEqual("封面图", issue.sections[0].title)
        self.assertEqual("magazine-section-1", issue.sections[0].slug)
        self.assertIn("这是正文。", issue.sections[1].markdown)

    def test_build_magazine_json_payload_includes_manifest_fields(self) -> None:
        issue = parse_magazine_issue_markdown(
            SAMPLE_MAGAZINE_MARKDOWN,
            sync_date="2026-04-02",
            issue_number=390,
            source_url="https://github.com/ruanyf/weekly/blob/master/docs/issue-390.md",
            raw_url="https://raw.githubusercontent.com/ruanyf/weekly/master/docs/issue-390.md",
        )

        payload = build_magazine_json_payload(issue)

        self.assertEqual("magazine", payload["report_kind"])
        self.assertEqual(390, payload["issue_number"])
        self.assertEqual("2026-04-02", payload["sync_date"])
        self.assertEqual(2, payload["sections_count"])
        self.assertEqual("封面图", payload["headings"][0]["title"])
        self.assertEqual("magazine-section-1", payload["sections"][0]["slug"])


if __name__ == "__main__":
    unittest.main()
