/** Flow JSON shape produced by `scriptFlows` (subset used for merged DOT). */
export type FlowElement = {
  type?: string;
  code?: string;
  lineNumber?: number;
  method?: string;
  filename?: string;
  methodFullName?: string;
};

export type FlowsPayload = {
  flows?: { index?: number; elements?: FlowElement[] }[];
  flowCount?: number;
};

export function dotLabelEscape(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/** One subgraph per flow; linear chain inside each cluster. */
export function buildMergedFlowDot(
  flows: FlowElement[][],
  sourceName: string,
  sinkName: string
): string {
  const title = `${sourceName} -> ${sinkName} (all flows)`;
  const lines: string[] = [
    `digraph "${title}" {`,
    '  rankdir=LR;',
    '  node [shape=box, fontname="Helvetica", fontsize=10];',
    '  edge [fontsize=9];',
  ];
  flows.forEach((elements, flowIdx) => {
    const clusterId = `cluster_f${flowIdx}`;
    const shortLabel =
      elements.length <= 8 ? `Flow ${flowIdx}` : `Flow ${flowIdx} (${elements.length} steps)`;
    lines.push(`  subgraph ${clusterId} { label="${dotLabelEscape(shortLabel)}"; fontsize=11;`);
    elements.forEach((el, elIdx) => {
      const nodeId = `f${flowIdx}_n${elIdx}`;
      const code = el.code ?? el.type ?? "?";
      const loc = el.filename
        ? `${el.filename}:${el.lineNumber ?? "?"}`
        : el.method
          ? `${el.method}:${el.lineNumber ?? "?"}`
          : String(el.lineNumber ?? "");
      const label = loc ? `${dotLabelEscape(code)}\\n${dotLabelEscape(loc)}` : dotLabelEscape(code);
      lines.push(`    ${nodeId} [label="${label}"];`);
    });
    for (let i = 0; i < elements.length - 1; i++) {
      lines.push(`    f${flowIdx}_n${i} -> f${flowIdx}_n${i + 1};`);
    }
    lines.push("  }");
  });
  lines.push("}");
  return lines.join("\n");
}
