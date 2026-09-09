// SE Ranking's current plan lineup, checked live on seranking.com/prices.html
// while writing this guide - the annual and monthly rate for each tier plus
// the limit that actually changes as you go up (keywords tracked, seats,
// AI prompts). The add-ons underneath are billed on top of a plan, not
// included in it, which none of the roundups holding page 1 for this query
// spell out.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const TIERS = [
  {
    name: "Core",
    monthly: "$129/mo",
    annual: "$103.20/mo billed annually",
    limits: "10 projects, 1 seat, 2,000 keywords/day, 100 AI prompts/day",
  },
  {
    name: "Growth",
    monthly: "$279/mo",
    annual: "$223.20/mo billed annually",
    limits: "30 projects, 3 seats, 5,000 keywords/day, 250 AI prompts/day",
  },
  {
    name: "Enterprise",
    monthly: "Custom",
    annual: "Custom",
    limits: "Negotiated limits, full API access",
  },
];

const ADD_ONS = [
  { name: "Agency Pack", price: "$69/mo, annual billing only", limits: "30 client seats, white-label platform" },
  { name: "AI Search", price: "$89/mo ($71.20/mo annual)", limits: "200-1,000 AI-search prompts depending on tier" },
  { name: "API", price: "$45/mo, annual billing only", limits: "3-60M credits depending on tier" },
];

export function SeRankingPricingTierTable() {
  return (
    <div className="not-prose my-6 space-y-4">
      <TableShell>
        <THead>
          <tr>
            <Th>Plan</Th>
            <Th>Price</Th>
            <Th>What scales with it</Th>
          </tr>
        </THead>
        <tbody>
          {TIERS.map((tier) => (
            <Tr key={tier.name}>
              <Td className="font-medium text-neutral-100">{tier.name}</Td>
              <Td>
                {tier.monthly}
                <span className="block text-xs text-neutral-500">{tier.annual}</span>
              </Td>
              <Td>{tier.limits}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <TableShell>
        <THead>
          <tr>
            <Th>Add-on (billed on top of a plan)</Th>
            <Th>Price</Th>
            <Th>What it unlocks</Th>
          </tr>
        </THead>
        <tbody>
          {ADD_ONS.map((addon) => (
            <Tr key={addon.name}>
              <Td className="font-medium text-neutral-100">{addon.name}</Td>
              <Td>{addon.price}</Td>
              <Td>{addon.limits}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="text-xs text-neutral-500">
        14-day free trial, no credit card required. Prices verified live on seranking.com/prices.html.
      </p>
    </div>
  );
}
