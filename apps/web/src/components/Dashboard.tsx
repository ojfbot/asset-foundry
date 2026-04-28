// MF expose entry point. The shell host (shell/vite.config.ts) imports this
// as `asset_foundry/Dashboard`. This same component also renders standalone
// at localhost:3035 via main.tsx — single source of truth.
//
// Phase 4 v1 ships one tab (Targets) so we can prove the MCP HTTP wire works
// end-to-end. Phase 4.5 expands to Runs + Generate (with SSE-subscribed
// progress bar per ADR-0010 §Pages).
import React, { useEffect, useState } from "react";
import {
  Header,
  HeaderName,
  Content,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  DataTable,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { callJsonTool } from "../lib/mcp-client";

interface TargetInfo {
  path: string;
  valid: boolean;
  propCount?: number;
  biomeCount?: number;
  error?: string;
}
interface TargetListResult {
  rootPath: string;
  targets: TargetInfo[];
}

const TARGET_HEADERS = [
  { key: "path", header: "Path" },
  { key: "propCount", header: "Props" },
  { key: "biomeCount", header: "Biomes" },
  { key: "status", header: "Status" },
];

function TargetsPanel(): JSX.Element {
  const [data, setData] = useState<TargetListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    callJsonTool<TargetListResult>("foundry.target.list")
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <InlineNotification
        kind="error"
        title="Failed to load targets"
        subtitle={error}
        hideCloseButton
      />
    );
  }
  if (!data) return <InlineLoading description="Loading targets…" />;

  const rows = data.targets.map((t) => ({
    id: t.path,
    path: t.path,
    propCount: t.propCount ?? "—",
    biomeCount: t.biomeCount ?? "—",
    status: t.valid ? "✓ valid" : `✗ ${t.error ?? "invalid"}`,
  }));

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        Scanning <code>{data.rootPath}</code> — {rows.length} target(s) found.
      </p>
      <DataTable rows={rows} headers={TARGET_HEADERS}>
        {({ rows: r, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((h) => (
                  <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                    {h.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {r.map((row) => (
                <TableRow {...getRowProps({ row })} key={row.id}>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.id}>{cell.value}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>
    </div>
  );
}

function RunsPanel(): JSX.Element {
  return (
    <p>
      Run history — coming in Phase 4.5. Will subscribe to{" "}
      <code>notifications/progress</code> over SSE per ADR-0010.
    </p>
  );
}

function GeneratePanel(): JSX.Element {
  return (
    <p>
      Generate form — coming in Phase 4.5. Calls{" "}
      <code>foundry.asset.generate</code> with a progressToken; renders a live
      progress bar from the streaming notifications.
    </p>
  );
}

export default function Dashboard(): JSX.Element {
  return (
    <div>
      <Header aria-label="Asset Foundry">
        <HeaderName href="#" prefix="Frame">
          Asset Foundry
        </HeaderName>
      </Header>
      <Content>
        <Tabs>
          <TabList aria-label="Asset Foundry tabs">
            <Tab>Targets</Tab>
            <Tab>Runs</Tab>
            <Tab>Generate</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <TargetsPanel />
            </TabPanel>
            <TabPanel>
              <RunsPanel />
            </TabPanel>
            <TabPanel>
              <GeneratePanel />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Content>
    </div>
  );
}
