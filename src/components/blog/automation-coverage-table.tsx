// What each category from the SERP grid above actually automates versus
// what it still leaves for a person to do - the honest job split behind
// "SEO automation tools" as a label, not a marketing claim.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    category: "Rank trackers & reporting",
    example: "Morningscore, RabbitSEO",
    automates: "Checking position, building the dashboard",
    manual: "Deciding what to write, publishing it, judging if it worked",
  },
  {
    category: "AI writers & content tools",
    example: "the roundups' AI-tool picks",
    automates: "Producing draft text on request",
    manual: "Research judgment, fact-checking, review, actually shipping",
  },
  {
    category: "Workflow-automation platforms",
    example: "Gumloop",
    automates: "Running a flow you design between steps",
    manual: "Designing that flow, and every SEO decision inside it",
  },
  {
    category: "Technical & audit suites",
    example: "Siteimprove",
    automates: "Crawling for broken links, schema, accessibility flags",
    manual: "Everything content-related - research, writing, tracking",
  },
] as const;

export function AutomationCoverageTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.category}
            title={r.category}
            meta={r.example}
            stats={[
              { label: "Automates", value: r.automates },
              { label: "Still yours", value: r.manual },
            ]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Category</Th>
          <Th>Example</Th>
          <Th>Automates</Th>
          <Th>Still yours</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.category}>
              <Td className="font-medium text-neutral-100">{r.category}</Td>
              <Td className="text-neutral-400">{r.example}</Td>
              <Td>{r.automates}</Td>
              <Td>{r.manual}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
