import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("seo_check", Path(__file__).with_name("seo-check.py"))
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)
BASE = "https://example.com"


def html(path="/"):
    return f'''<!doctype html><html><head>
    <title>A &amp; B</title><link href='{BASE}{path}' rel='canonical'>
    <meta name='description' content='An actual description'>
    <meta property='og:title' content='A &amp; B'>
    <meta property='og:description' content='An actual description'>
    <meta property='og:image' content='{BASE}/og.png'>
    <meta property='og:url' content='{BASE}{path}'>
    <meta property='og:site_name' content='Example'>
    <meta name='twitter:card' content='summary_large_image'>
    <script type='application/ld+json'>{{"@type":"WebSite","name":"Example"}}</script>
    </head><body><h1>A &amp; B</h1></body></html>'''


class SeoCheckTests(unittest.TestCase):
    def test_parser_handles_attributes_entities_and_comments(self):
        page = seo.Page(html().replace("</body>", "<!-- <h1>Fake</h1> --></body>"))
        self.assertEqual(page.titles, ["A & B"])
        self.assertEqual(seo.page_issues(page, BASE + "/", "Example", {}), [])

    def test_wrong_and_duplicate_canonicals_fail(self):
        for markup in (html("/wrong"), html() + f'<link rel="canonical" href="{BASE}/">'):
            self.assertTrue(any("Canonical" in issue for issue in seo.page_issues(seo.Page(markup), BASE + "/", "Example", {})))

    def test_invalid_schema_is_not_silently_ignored(self):
        page = seo.Page(html() + '<script type="application/ld+json">{bad}</script>')
        self.assertIn("Structured data missing or contains invalid JSON", seo.page_issues(page, BASE + "/", "Example", {}))

    def test_robots_meta_and_header_refusals_are_detected(self):
        for name in ("robots", "googlebot"):
            page = seo.Page(html() + f'<meta name="{name}" content="noindex, follow">')
            self.assertTrue(any("excluded" in issue for issue in seo.page_issues(page, BASE + "/", "Example", {})))
        self.assertTrue(any("excluded" in issue for issue in seo.page_issues(seo.Page(html()), BASE + "/", "Example", {"x-robots-tag": "noindex"})))

    def test_name_comes_from_website_node_in_a_graph(self):
        self.assertEqual(seo.website_name([{"@graph": [{"@type": "WebSite", "name": "Graph site"}]}]), "Graph site")

    def test_scoped_and_zero_length_snippet_directives_are_detected(self):
        for directive in ("googlebot:noindex", "Googlebot: nosnippet", "max-snippet:0", "max-snippet: 0"):
            with self.subTest(directive=directive):
                issues = seo.page_issues(seo.Page(html()), BASE + "/", "Example", {"x-robots-tag": directive})
                self.assertTrue(any("excluded" in issue for issue in issues))

    def test_origin_rejects_credentials_and_non_origins(self):
        for origin in ("http:", "https://user:secret@example.com", "https://example.com?x=1", "https://example.com#part", "https://example.com/path", "file:///tmp/page", "https://example.com:bad"):
            with self.subTest(origin=origin):
                self.assertFalse(seo.valid_origin(origin))
        self.assertTrue(seo.valid_origin(BASE))
        self.assertTrue(seo.valid_origin("http://127.0.0.1:8790"))

    def reader(self, url):
        if url.endswith("robots.txt"):
            body = f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml"
            content_type = "text/plain"
        elif url.endswith("sitemap.xml"):
            body = f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{BASE}/</loc></url></urlset>'
            content_type = "application/xml"
        else:
            body, content_type = html(), "text/html"
        return (200, url, {"content-type": content_type}, body)

    def test_success_reports_its_sample_and_sitemap_population(self):
        report = seo.audit(BASE, ["/"], self.reader)
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["pages"][0]["issues"], [])
        self.assertEqual(report["sitemap_urls"], 1)
        self.assertIn("not a Google crawl", report["scope"])

    def test_preview_can_keep_production_canonicals(self):
        preview = "http://127.0.0.1:8789"
        def local(url):
            status, _, headers, body = self.reader(url.replace(preview, BASE))
            return status, url, headers, body
        report = seo.audit(preview, ["/"], local, canonical_base=BASE)
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["pages"][0]["issues"], [])

    def test_unreachable_page_and_sitemap_are_unmeasured(self):
        def fail(url):
            raise TimeoutError("fixture timeout")
        report = seo.audit(BASE, ["/"], fail)
        self.assertEqual(len(report["gaps"]), 2)
        self.assertIn("unmeasured", report["pages"][0])
        self.assertIsNone(report["sitemap_urls"])

    def test_bot_block_and_missing_sitemap_entry_fail(self):
        def blocked(url):
            status, final, headers, body = self.reader(url)
            if url.endswith("robots.txt"):
                body = body.replace("Allow: /", "Disallow: /")
            return status, final, headers, body
        report = seo.audit(BASE, ["/what"], blocked)
        self.assertIn("Missing from sitemap", report["pages"][0]["issues"])
        self.assertIn("robots.txt disallows Googlebot", report["pages"][0]["issues"])

    def test_http_error_and_redirect_cannot_pass(self):
        def changed(url):
            status, final, headers, body = self.reader(url)
            if url == BASE + "/":
                status, final = 503, BASE + "/error"
            return status, final, headers, body
        report = seo.audit(BASE, ["/"], changed)
        self.assertIn("HTTP 503", report["pages"][0]["issues"])
        self.assertTrue(any("Redirected" in item for item in report["pages"][0]["issues"]))


if __name__ == "__main__":
    unittest.main()
