#!/usr/bin/env python3
"""Read-only, bounded SEO audit. Python standard library; no credentials.

Reports what was fetched, not Google's indexing or ranking decisions.
Run: python3 scripts/seo-check.py [--base URL] [paths ...]
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

DEFAULT_PATHS = ("/", "/what", "/developers", "/menu", "/menu/hello", "/conformance", "/corpus", "/try")
MAX_BYTES = 8 * 1024 * 1024


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.meta, self.canonicals, self.titles, self.schemas = {}, [], [], []
        self.h1_count, self.schema_errors = 0, 0
        self.capture, self.parts = None, []
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = (attrs.get("name") or attrs.get("property") or "").lower()
            self.meta.setdefault(key, []).append(attrs.get("content") or "")
        if tag == "link" and "canonical" in (attrs.get("rel") or "").lower().split():
            self.canonicals.append(attrs.get("href") or "")
        if tag == "h1":
            self.h1_count += 1
        if tag == "title" or (tag == "script" and attrs.get("type") == "application/ld+json"):
            self.capture, self.parts = tag, []

    def handle_data(self, data):
        if self.capture:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag != self.capture:
            return
        content = "".join(self.parts).strip()
        if tag == "title":
            self.titles.append(content)
        else:
            try:
                self.schemas.append(json.loads(content))
            except ValueError:
                self.schema_errors += 1
        self.capture, self.parts = None, []


def page_issues(page, expected_url, site_name, headers):
    issues = []
    if len(page.titles) != 1 or not page.titles[0]:
        issues.append("Expected one nonempty title")
    if page.h1_count != 1:
        issues.append("Expected one h1")
    if page.canonicals != [expected_url]:
        issues.append("Canonical missing, duplicated, or differs from requested page")
    for key in ("description", "og:title", "og:description", "og:image", "twitter:card"):
        values = page.meta.get(key, [])
        if len(values) != 1 or not values[0].strip():
            issues.append(f"Expected one nonempty {key}")
    if page.meta.get("og:url") != [expected_url]:
        issues.append("Open Graph URL differs from canonical")
    if not site_name or page.meta.get("og:site_name") != [site_name]:
        issues.append("Site name missing or differs from homepage WebSite identity")
    directives = " ".join(page.meta.get("robots", []) + page.meta.get("googlebot", []) + [headers.get("x-robots-tag", "")]).lower()
    if re.search(r"\b(?:noindex|none|nosnippet)\b|\bmax-snippet\s*:\s*0\b", directives):
        issues.append("Indexing or snippets excluded on a sampled public page")
    if page.schema_errors or not page.schemas:
        issues.append("Structured data missing or contains invalid JSON")
    return issues


def read(url):
    request = Request(url, headers={"User-Agent": "scvd-seo-check/1 (+https://scvd.store)", "Accept": "text/html,application/xml,text/plain;q=0.9"})
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("Response exceeded audit byte limit; unmeasured")
        return response.status, response.url, {k.lower(): v for k, v in response.headers.items()}, body.decode("utf-8")


def website_name(schemas):
    for node in schemas:
        if isinstance(node, list):
            found = website_name(node)
        elif isinstance(node, dict):
            if node.get("@type") == "WebSite":
                return node.get("name")
            found = website_name(node.get("@graph", []))
        else:
            found = None
        if found:
            return found
    return None


def audit(base, paths, reader=read, canonical_base=None):
    canonical_base = canonical_base or base
    urls = [urljoin(base + "/", path) for path in paths]
    targets = list(dict.fromkeys([base + "/", base + "/robots.txt", base + "/sitemap.xml", *urls]))
    def fetch(url):
        try:
            return url, reader(url)
        except Exception as error:
            return url, {"error": type(error).__name__ + ": " + str(error)}
    with ThreadPoolExecutor(max_workers=3) as pool:
        fetched = dict(pool.map(fetch, targets))
    gaps, sitemap, robots = [], None, None
    root = fetched[base + "/"]
    name = website_name(Page(root[3]).schemas) if isinstance(root, tuple) and root[0] == 200 else None
    for kind in ("robots.txt", "sitemap.xml"):
        data = fetched[base + "/" + kind]
        if not isinstance(data, tuple) or data[0] != 200:
            gaps.append(f"{kind}: fetch failed; unmeasured")
            continue
        try:
            if kind == "robots.txt":
                robots = RobotFileParser()
                robots.parse(data[3].splitlines())
                if canonical_base + "/sitemap.xml" not in (robots.site_maps() or []):
                    gaps.append("robots.txt does not declare the expected sitemap")
            else:
                xml = ET.fromstring(data[3])
                if xml.tag != "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset":
                    raise ValueError("Sitemap indexes not expanded by this bounded audit")
                sitemap = {el.text for el in xml.findall("{*}url/{*}loc")}
        except (ValueError, ET.ParseError) as error:
            gaps.append(f"{kind}: {error}")
    rows = []
    for path, url in zip(paths, urls):
        expected = urljoin(canonical_base + "/", path)
        data = fetched[url]
        if not isinstance(data, tuple):
            rows.append({"url": url, "unmeasured": data["error"]})
            continue
        status, final_url, headers, body = data
        issues = []
        page = Page(body)
        if status != 200:
            issues.append(f"HTTP {status}")
        if "text/html" not in headers.get("content-type", ""):
            issues.append("Expected HTML")
        if final_url != url:
            issues.append(f"Redirected to {final_url}")
        issues.extend(page_issues(page, expected, name, headers))
        if sitemap is not None and expected not in sitemap:
            issues.append("Missing from sitemap")
        if robots is not None and not robots.can_fetch("Googlebot", expected):
            issues.append("robots.txt disallows Googlebot")
        rows.append({"url": url, "status": status, "title": page.titles, "canonical": page.canonicals, "issues": issues})
    return {"observed_at": datetime.now(timezone.utc).isoformat(), "scope": "Bounded public-page sample; not a Google crawl, index inventory or ranking measurement", "site_name": name, "sitemap_urls": len(sitemap) if sitemap is not None else None, "gaps": gaps, "pages": rows}


def valid_origin(origin):
    try:
        parsed = urlsplit(origin)
        # Read the port as well: urlsplit defers malformed-port validation.
        _ = parsed.port
        return bool(parsed.scheme in ("http", "https") and parsed.hostname
                    and not (parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment))
    except ValueError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="https://scvd.store")
    parser.add_argument("--canonical-base", help="Expected published origin when auditing a local preview")
    parser.add_argument("paths", nargs="*", default=list(DEFAULT_PATHS))
    args = parser.parse_args()
    base = args.base.rstrip("/")
    if not valid_origin(base):
        parser.error("--base must be an HTTP(S) origin")
    canonical_base = args.canonical_base.rstrip("/") if args.canonical_base else base
    if not valid_origin(canonical_base):
        parser.error("--canonical-base must be an HTTP(S) origin")
    if any(not path.startswith("/") or path.startswith("//") or "?" in path or "#" in path for path in args.paths):
        parser.error("paths must be absolute site paths without queries or fragments")
    report = audit(base, list(dict.fromkeys(args.paths)), canonical_base=canonical_base)
    print(json.dumps(report, indent=2))
    return int(bool(report["gaps"] or any(row.get("issues") or row.get("unmeasured") for row in report["pages"])))


if __name__ == "__main__":
    sys.exit(main())
