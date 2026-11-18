import type { ToolKey } from "@/content/types";
import { LoyaltyCalculator } from "@/components/tools/LoyaltyCalculator";
import { QrGenerator } from "@/components/tools/QrGenerator";
import { ProgramCost } from "@/components/tools/ProgramCost";
import { RepeatRevenue } from "@/components/tools/RepeatRevenue";
import { CardBuilder } from "@/components/tools/CardBuilder";
import type { CP } from "./site-data";

export function ToolEmbed({ tool, country, shareable = false }: { tool: ToolKey; country: CP; shareable?: boolean }) {
  switch (tool) {
    case "loyalty-calculator":
      return <LoyaltyCalculator country={country} shareable={shareable} />;
    case "qr-generator":
      return <QrGenerator />;
    case "program-cost":
      return <ProgramCost country={country} shareable={shareable} />;
    case "repeat-revenue":
      return <RepeatRevenue country={country} shareable={shareable} />;
    case "card-builder":
      return <CardBuilder country={country} shareable={shareable} />;
    default:
      return null;
  }
}
