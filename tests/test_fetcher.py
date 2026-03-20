import unittest
from unittest import mock
from urllib.error import URLError

from mipaper.fetcher import (
    build_github_trending_url,
    build_hf_daily_url,
    build_venue_url,
    extract_total_papers,
    fetch_complete_venue_snapshot,
    fetch_feed_html,
    parse_feed_html,
    parse_github_trending_html,
    parse_hf_daily_html,
)


SAMPLE_HTML = """
<div class="papers">
  <div id="2603.05498" class="panel paper">
    <h2 class="title">
      <a href="https://arxiv.org/abs/2603.05498" target="_blank"><span>#1</span></a>
      <a id="title-2603.05498" class="title-link notranslate" href="/arxiv/2603.05498" target="_blank">
        The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks
      </a>
    </h2>
    <p id="authors-2603.05498" class="metainfo authors notranslate">
      <strong>Authors</strong>:
      <a class="author notranslate" href="https://arxiv.org/search/?searchtype=author&amp;query=Shangwen Sun" target="_blank">Shangwen Sun</a>,
      <a class="author notranslate" href="https://arxiv.org/search/?searchtype=author&amp;query=Yann LeCun" target="_blank">Yann LeCun</a>
    </p>
    <p id="summary-2603.05498" class="summary notranslate">
      We study two recurring phenomena in Transformer language models.
    </p>
  </div>
  <div id="2603.05485" class="panel paper">
    <h2 class="title">
      <a href="https://arxiv.org/abs/2603.05485" target="_blank"><span>#2</span></a>
      <a id="title-2603.05485" class="title-link notranslate" href="/arxiv/2603.05485" target="_blank">
        Towards Provably Unbiased LLM Judges via Bias-Bounded Evaluation
      </a>
    </h2>
    <p id="authors-2603.05485" class="metainfo authors notranslate">
      <strong>Authors</strong>:
      <a class="author notranslate" href="https://arxiv.org/search/?searchtype=author&amp;query=Benjamin Feuer" target="_blank">Benjamin Feuer</a>
    </p>
    <p id="summary-2603.05485" class="summary notranslate">
      We propose average bias-boundedness.
    </p>
  </div>
</div>
"""


class ParseFeedHTMLTest(unittest.TestCase):
    def test_extract_total_papers_reads_venue_total(self) -> None:
        html = """
        <body id="venue">
          <p class="info notranslate">Total: 5,357</p>
        </body>
        """

        self.assertEqual(5357, extract_total_papers(html))

    def test_parse_feed_html_extracts_title_and_links(self) -> None:
        papers = parse_feed_html(SAMPLE_HTML)

        self.assertEqual(2, len(papers))
        self.assertEqual("2603.05498", papers[0].paper_id)
        self.assertEqual(
            "The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks",
            papers[0].title,
        )
        self.assertEqual("https://arxiv.org/abs/2603.05498", papers[0].abs_url)
        self.assertEqual("https://arxiv.org/pdf/2603.05498", papers[0].pdf_url)
        self.assertEqual("https://papers.cool/arxiv/2603.05498", papers[0].detail_url)
        self.assertEqual(["Shangwen Sun", "Yann LeCun"], papers[0].authors)
        self.assertEqual(
            "We study two recurring phenomena in Transformer language models.",
            papers[0].abstract,
        )
        self.assertEqual([], papers[0].subjects)

    def test_parse_feed_html_extracts_venue_pdf_and_subject(self) -> None:
        html = """
        <div class="papers">
          <div id="abc@OpenReview" class="panel paper">
            <h2 class="title">
              <a href="https://openreview.net/forum?id=abc" target="_blank"><span>#1</span></a>
              <a id="title-abc@OpenReview" class="title-link notranslate" href="/venue/abc@OpenReview" target="_blank">
                Venue Paper
              </a>
              <a id="pdf-abc@OpenReview" class="title-pdf notranslate" data="https://openreview.net/pdf?id=abc">[PDF]</a>
            </h2>
            <p id="authors-abc@OpenReview" class="metainfo authors notranslate">
              <strong>Authors</strong>:
              <a class="author notranslate" href="https://example.com/a" target="_blank">Ada Lovelace</a>
            </p>
            <p id="summary-abc@OpenReview" class="summary notranslate">A venue abstract.</p>
            <p id="subjects-abc@OpenReview" class="metainfo subjects">
              <strong>Subject</strong>:
              <a class="subject-1" href="/venue/ICLR.2026?group=Oral" target="_blank">ICLR.2026 - Oral</a>
            </p>
          </div>
        </div>
        """

        papers = parse_feed_html(html)

        self.assertEqual(1, len(papers))
        self.assertEqual("Venue Paper", papers[0].title)
        self.assertEqual("https://openreview.net/pdf?id=abc", papers[0].pdf_url)
        self.assertEqual("https://papers.cool/venue/abc@OpenReview", papers[0].detail_url)
        self.assertEqual(["Oral"], papers[0].subjects)

    def test_parse_feed_html_maps_plain_venue_subject_to_accept(self) -> None:
        html = """
        <div class="papers">
          <div id="abc@CVF" class="panel paper">
            <h2 class="title">
              <a id="title-abc@CVF" class="title-link notranslate" href="/venue/abc@CVF" target="_blank">Venue Paper</a>
              <a id="pdf-abc@CVF" class="title-pdf notranslate" data="https://example.com/paper.pdf">[PDF]</a>
            </h2>
            <p id="subjects-abc@CVF" class="metainfo subjects">
              <strong>Subject</strong>:
              <a class="subject-1" href="/venue/CVPR.2024" target="_blank">CVPR.2024</a>
            </p>
          </div>
        </div>
        """

        papers = parse_feed_html(html)

        self.assertEqual(["Accept"], papers[0].subjects)

    def test_build_venue_url_supports_group_filter(self) -> None:
        self.assertEqual("https://papers.cool/venue/ICLR.2026?show=1000", build_venue_url("ICLR.2026"))
        self.assertEqual(
            "https://papers.cool/venue/ICLR.2026?show=1000&group=Oral",
            build_venue_url("ICLR.2026", group="Oral"),
        )

    def test_parse_hf_daily_html_extracts_embedded_daily_papers(self) -> None:
        html = """
        <div
          data-target="DailyPapers"
          data-props="{&quot;dateString&quot;:&quot;2026-03-09&quot;,&quot;dailyPapers&quot;:[{&quot;paper&quot;:{&quot;id&quot;:&quot;2603.01234&quot;,&quot;title&quot;:&quot;Test HF Paper&quot;,&quot;summary&quot;:&quot;A compact summary.&quot;,&quot;authors&quot;:[{&quot;name&quot;:&quot;Ada Lovelace&quot;},{&quot;name&quot;:&quot;Alan Turing&quot;}],&quot;submittedOnDailyBy&quot;:{&quot;fullname&quot;:&quot;taesiri&quot;},&quot;submittedOnDailyAt&quot;:&quot;2026-03-09T01:22:24.366Z&quot;,&quot;upvotes&quot;:42}}]}"
        ></div>
        """

        papers = parse_hf_daily_html(html, "2026-03-09")

        self.assertEqual(1, len(papers))
        self.assertEqual("2026-03-09", papers[0].report_date)
        self.assertEqual("2603.01234", papers[0].paper_id)
        self.assertEqual("Test HF Paper", papers[0].title)
        self.assertEqual(["Ada Lovelace", "Alan Turing"], papers[0].authors)
        self.assertEqual("A compact summary.", papers[0].abstract)
        self.assertEqual("taesiri", papers[0].submitted_by)
        self.assertEqual(42, papers[0].upvotes)
        self.assertEqual("https://huggingface.co/papers/2603.01234", papers[0].hf_url)
        self.assertEqual("https://arxiv.org/pdf/2603.01234", papers[0].arxiv_pdf_url)
        self.assertEqual("https://papers.cool/arxiv/2603.01234", papers[0].papers_cool_url)

    def test_parse_hf_daily_html_parses_string_counters(self) -> None:
        html = """
        <div
          data-target="DailyPapers"
          data-props="{&quot;dailyPapers&quot;:[{&quot;paper&quot;:{&quot;id&quot;:&quot;2603.01235&quot;,&quot;title&quot;:&quot;Counter Paper&quot;},&quot;upvotes&quot;:&quot;1,234&quot;,&quot;comments&quot;:&quot;56&quot;}]}"
        ></div>
        """

        papers = parse_hf_daily_html(html, "2026-03-09")

        self.assertEqual(1, len(papers))
        self.assertEqual(1234, papers[0].upvotes)
        self.assertEqual(56, papers[0].comments)

    def test_build_hf_daily_url(self) -> None:
        self.assertEqual("https://huggingface.co/papers/date/2026-03-09", build_hf_daily_url("2026-03-09"))

    @mock.patch("mipaper.fetcher.time.sleep")
    @mock.patch("mipaper.fetcher.urlopen")
    def test_fetch_feed_html_retries_transient_errors(self, mocked_urlopen: mock.Mock, mocked_sleep: mock.Mock) -> None:
        response = mock.MagicMock()
        response.read.return_value = b"<html>ok</html>"
        context = mock.MagicMock()
        context.__enter__.return_value = response
        context.__exit__.return_value = None
        mocked_urlopen.side_effect = [URLError("temporary"), context]

        html = fetch_feed_html("https://example.com/feed", timeout=5, retries=2)

        self.assertEqual("<html>ok</html>", html)
        self.assertEqual(2, mocked_urlopen.call_count)
        mocked_sleep.assert_called_once_with(1)

    def test_build_github_trending_url(self) -> None:
        self.assertEqual(
            "https://github.com/trending?since=weekly&spoken_language_code=",
            build_github_trending_url("weekly", ""),
        )

    def test_parse_github_trending_html_extracts_repositories(self) -> None:
        html = """
        <article class="Box-row">
          <h2>
            <a href="/openai/codex">
              openai / codex
            </a>
          </h2>
          <p class="col-9 color-fg-muted my-1 pr-4">
            Terminal coding agent.
          </p>
          <div>
            <span itemprop="programmingLanguage">TypeScript</span>
            <a href="/openai/codex/stargazers">12,345</a>
            <a href="/openai/codex/forks">678</a>
            <span>9,001 stars this week</span>
            <a href="/alice"><img alt="@alice" /></a>
            <a href="/bob"><img alt="@bob" /></a>
          </div>
        </article>
        """

        repos = parse_github_trending_html(html, "2026-03-12")

        self.assertEqual(1, len(repos))
        self.assertEqual("openai/codex", repos[0].full_name)
        self.assertEqual("openai", repos[0].owner)
        self.assertEqual("codex", repos[0].name)
        self.assertEqual("TypeScript", repos[0].language)
        self.assertEqual(12345, repos[0].stars)
        self.assertEqual(678, repos[0].forks)
        self.assertEqual(9001, repos[0].stars_this_week)
        self.assertEqual(["alice", "bob"], repos[0].built_by)
        self.assertEqual("https://github.com/openai/codex", repos[0].repo_url)

    def test_parse_github_trending_html_extracts_counts_with_svg_icons(self) -> None:
        html = """
        <article class="Box-row">
          <h2>
            <a href="/openai/codex">
              openai / codex
            </a>
          </h2>
          <div>
            <a href="/openai/codex/stargazers"><svg></svg> 32,497</a>
            <a href="/openai/codex/forks"><svg></svg> 5,064</a>
            <span>23,574 stars this week</span>
          </div>
        </article>
        """

        repos = parse_github_trending_html(html, "2026-03-12")

        self.assertEqual(1, len(repos))
        self.assertEqual(32497, repos[0].stars)
        self.assertEqual(5064, repos[0].forks)
        self.assertEqual(23574, repos[0].stars_this_week)

    def test_fetch_complete_venue_snapshot_expands_show_until_total_is_covered(self) -> None:
        page_with_five = """
        <body id="venue">
          <p class="info notranslate">Total: 7</p>
          <div class="papers">
            <div id="p1" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p1">One</a><a class="title-pdf" data="https://example.com/1.pdf">[PDF]</a></h2></div>
            <div id="p2" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p2">Two</a><a class="title-pdf" data="https://example.com/2.pdf">[PDF]</a></h2></div>
            <div id="p3" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p3">Three</a><a class="title-pdf" data="https://example.com/3.pdf">[PDF]</a></h2></div>
            <div id="p4" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p4">Four</a><a class="title-pdf" data="https://example.com/4.pdf">[PDF]</a></h2></div>
            <div id="p5" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p5">Five</a><a class="title-pdf" data="https://example.com/5.pdf">[PDF]</a></h2></div>
          </div>
        </body>
        """
        page_with_seven = """
        <body id="venue">
          <p class="info notranslate">Total: 7</p>
          <div class="papers">
            <div id="p1" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p1">One</a><a class="title-pdf" data="https://example.com/1.pdf">[PDF]</a></h2></div>
            <div id="p2" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p2">Two</a><a class="title-pdf" data="https://example.com/2.pdf">[PDF]</a></h2></div>
            <div id="p3" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p3">Three</a><a class="title-pdf" data="https://example.com/3.pdf">[PDF]</a></h2></div>
            <div id="p4" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p4">Four</a><a class="title-pdf" data="https://example.com/4.pdf">[PDF]</a></h2></div>
            <div id="p5" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p5">Five</a><a class="title-pdf" data="https://example.com/5.pdf">[PDF]</a></h2></div>
            <div id="p6" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p6">Six</a><a class="title-pdf" data="https://example.com/6.pdf">[PDF]</a></h2></div>
            <div id="p7" class="panel paper"><h2 class="title"><a class="title-link" href="/venue/p7">Seven</a><a class="title-pdf" data="https://example.com/7.pdf">[PDF]</a></h2></div>
          </div>
        </body>
        """
        fetched_urls = []

        def fake_fetcher(url: str) -> str:
            fetched_urls.append(url)
            return page_with_five if "show=5" in url else page_with_seven

        html_text, source_url, total_papers, requested_show = fetch_complete_venue_snapshot(
            "ICLR.2026",
            initial_show=5,
            fetcher=fake_fetcher,
            max_attempts=3,
        )

        self.assertEqual(7, total_papers)
        self.assertEqual(10, requested_show)
        self.assertEqual("https://papers.cool/venue/ICLR.2026?show=10", source_url)
        self.assertEqual(2, len(fetched_urls))
        self.assertEqual(7, len(parse_feed_html(html_text)))


if __name__ == "__main__":
    unittest.main()
