import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AisuiResponseText } from "@/components/chat/MessageList";

describe("AisuiResponseText", () => {
  it("renders markdown tables without exposing raw pipe syntax", () => {
    const markup = renderToStaticMarkup(
      <AisuiResponseText
        text={
          "Here is the latest on SUI:\n\n| Metric | Value |\n|---|---|\n| **Price** | $1.03 |\n| 24h Volume | N/A |"
        }
      />,
    );

    expect(markup).toContain("<table");
    expect(markup).toContain("<th");
    expect(markup).toContain("Metric");
    expect(markup).toContain("<strong>Price</strong>");
    expect(markup).not.toContain("| Metric | Value |");
    expect(markup).not.toContain("|---|---|");
  });

  it("renders lists, headings, separators, and inline emphasis", () => {
    const markup = renderToStaticMarkup(
      <AisuiResponseText
        text={
          "Here is the latest:\n\n## SUI Market\n---\n1. **Portfolio** value\n2. *Recent* activity\n\n### Top Pools"
        }
      />,
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain("SUI Market");
    expect(markup).toContain("<hr");
    expect(markup).toContain("<ol");
    expect(markup).toContain("<strong>Portfolio</strong>");
    expect(markup).toContain("<em>Recent</em>");
    expect(markup).toContain("Top Pools");
    expect(markup).not.toContain("## SUI Market");
    expect(markup).not.toContain("---");
  });

  it("renders inline code and markdown links", () => {
    const markup = renderToStaticMarkup(
      <AisuiResponseText
        text={
          "Object `0x6` is the Clock. Open [Sui Bridge](https://bridge.sui.io/?token=ETH)."
        }
      />,
    );

    expect(markup).toContain("<code");
    expect(markup).toContain("0x6");
    expect(markup).toContain("<a");
    expect(markup).toContain('href="https://bridge.sui.io/?token=ETH"');
    expect(markup).toContain("Sui Bridge");
    expect(markup).not.toContain("`0x6`");
    expect(markup).not.toContain("[Sui Bridge]");
  });
});
