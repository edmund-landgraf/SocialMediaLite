import { describe, expect, it } from "vitest";
import { parseOgFromHtml } from "./linkPreview.js";

describe("parseOgFromHtml", () => {  const base = new URL("https://example.com/article");

  it("reads standard meta description and og tags", () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Article Title" />
      <meta name="description" content="A plain meta summary for the page." />
      <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
    </head><body></body></html>`;
    const parsed = parseOgFromHtml(html, base);
    expect(parsed.title).toBe("Article Title");
    expect(parsed.description).toBe("A plain meta summary for the page.");
    expect(parsed.imageUrl).toBe("https://cdn.example.com/hero.jpg");
  });

  it("falls back to JSON-LD description", () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
        {"@type":"Article","headline":"LD Title","description":"JSON-LD summary text."}
      </script>
    </head><body></body></html>`;
    const parsed = parseOgFromHtml(html, base);
    expect(parsed.title).toBe("LD Title");
    expect(parsed.description).toBe("JSON-LD summary text.");
  });
});
