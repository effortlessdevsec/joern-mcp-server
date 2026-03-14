import { writeTempScript } from "./joern.js";
import path from "path";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Generate script that loads CPG, runs dataflow, gets flows source->sink, writes JSON to outputFile */
export function scriptFlows(
  sourceCallName: string,
  sinkCallNamePattern: string,
  outputFile: string,
  opts?: {
    sourceMatch?: "exact" | "regex";
    sinkMatch?: "exact" | "regex";
    sourceMethodFullNameRegex?: string;
    sinkMethodFullNameRegex?: string;
    sourceArgIndex?: number;
    sinkArgIndex?: number;
    methodRegex?: string;
    fileRegex?: string;
  }
): string {
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  const sourceMatch = opts?.sourceMatch === "exact" ? "exact" : "regex";
  const sinkMatch = opts?.sinkMatch === "exact" ? "exact" : "regex";
  const sourceMfn = opts?.sourceMethodFullNameRegex?.trim();
  const sinkMfn = opts?.sinkMethodFullNameRegex?.trim();
  const sourceArgIndex =
    typeof opts?.sourceArgIndex === "number" ? opts!.sourceArgIndex : undefined;
  const sinkArgIndex =
    typeof opts?.sinkArgIndex === "number" ? opts!.sinkArgIndex : undefined;
  const methodRegex =
    typeof opts?.methodRegex === "string" && opts.methodRegex.trim() !== ""
      ? opts.methodRegex
      : undefined;
  const fileRegex =
    typeof opts?.fileRegex === "string" && opts.fileRegex.trim() !== ""
      ? opts.fileRegex
      : undefined;

  const sourceSelect = sourceMfn
    ? `cpg.call.methodFullName("${esc(sourceMfn)}")`
    : sourceMatch === "exact"
      ? `cpg.call.nameExact("${esc(sourceCallName)}")`
      : `cpg.call.name("${esc(sourceCallName)}")`;
  const sinkSelect = sinkMfn
    ? `cpg.call.methodFullName("${esc(sinkMfn)}")`
    : sinkMatch === "exact"
      ? `cpg.call.nameExact("${esc(sinkCallNamePattern)}")`
      : `cpg.call.name("${esc(sinkCallNamePattern)}")`;

  const sourceNode =
    typeof sourceArgIndex === "number"
      ? `sourceCalls.argument(${sourceArgIndex})`
      : "sourceCalls";
  const sinkNode =
    typeof sinkArgIndex === "number"
      ? `sinkCalls.argument(${sinkArgIndex})`
      : "sinkCalls";

  const methodRegexLine = methodRegex
    ? `  val methodRx = "${esc(methodRegex)}".r`
    : `  val methodRx: scala.util.matching.Regex = null`;
  const fileRegexLine = fileRegex
    ? `  val fileRx = "${esc(fileRegex)}".r`
    : `  val fileRx: scala.util.matching.Regex = null`;

  return [
    "@main def main() = {",
    "  run.ossdataflow",
    `  val sourceCalls = ${sourceSelect}`,
    `  val sinkCalls   = ${sinkSelect}`,
    `  val source = ${sourceNode}`,
    `  val sink   = ${sinkNode}`,
    "  val flows0  = sink.reachableByFlows(source).l",
    methodRegexLine,
    fileRegexLine,
    "  def keepByMeta(flow: io.joern.dataflowengineoss.language.Path) = {",
    "    if (methodRx == null && fileRx == null) true",
    "    else {",
    "      flow.elements.exists { n =>",
    "        val loc = try n.location catch { case _: Exception => null }",
    "        val m = if (loc == null) \"\" else loc.methodFullName",
    "        val f = if (loc == null) \"\" else loc.filename",
    "        val okM = if (methodRx == null) true else methodRx.findFirstIn(m).nonEmpty",
    "        val okF = if (fileRx == null) true else fileRx.findFirstIn(f).nonEmpty",
    "        okM && okF",
    "      }",
    "    }",
    "  }",
    "  val flows = flows0.filter(keepByMeta)",
    "  import java.nio.file.{Files, Paths}",
    "  import io.shiftleft.codepropertygraph.generated.nodes.CfgNode",
    "  val methodsInFlows = flows.flatMap(_.elements).collect { case n: CfgNode => n.method }.distinct.toList",
    '  def escape(s: String) = s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")',
    "  val flowSummaries = flows.zipWithIndex.map { case (flow, i) =>",
    "    val elts = flow.elements.map { n =>",
    "      val code = try n.asInstanceOf[CfgNode].code catch { case _: Exception => n.toString }",
    "      val line = try n.lineNumber.getOrElse(0) catch { case _: Exception => 0 }",
    "      val meth = try n.asInstanceOf[CfgNode].method.name catch { case _: Exception => \"\" }",
    "      val loc = try n.location catch { case _: Exception => null }",
    "      val fn = if (loc == null) \"N/A\" else loc.filename",
    "      val mfn = if (loc == null) \"<empty>\" else loc.methodFullName",
    '      s"""{"type":"${escape(n.getClass.getSimpleName)}","code":"${escape(code)}","lineNumber":$line,"method":"${escape(meth)}","filename":"${escape(fn)}","methodFullName":"${escape(mfn)}"}"""',
    "    }.mkString(\"[\", \",\", \"]\")",
    '    s"""{"index":$i,"elements":$elts}"""',
    "  }.mkString(\"[\", \",\", \"]\")",
    "  val methodSummaries = methodsInFlows.map { m =>",
    '    s"""{"name":"${escape(m.name)}","fullName":"${escape(m.fullName)}","filename":"${escape(m.filename)}"}"""',
    "  }.mkString(\"[\", \",\", \"]\")",
    '  val json = s"""{"flowCount":${flows.size},"methodCount":${methodsInFlows.size},"flows":$flowSummaries,"methods":$methodSummaries}"""',
    `  Files.writeString(Paths.get("${outEsc}"), json)`,
    `  println("WROTE_FLOWS:" + "${outEsc}")`,
    "}",
  ].join("\n");
}

/** Generate script that lists method names and writes JSON array to outputFile */
export function scriptListMethods(outputFile: string): string {
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  return [
    "@main def main() = {",
    "  run.ossdataflow",
    "  val names = cpg.method.name.dedup.sorted.l",
    "  import java.nio.file.{Files, Paths}",
    '  val arr = "[" + names.map(n => "\\"" + n.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"").mkString(",") + "]"',
    `  Files.writeString(Paths.get("${outEsc}"), arr)`,
    `  println("WROTE_LIST:" + "${outEsc}")`,
    "}",
  ].join("\n");
}

/** Generate script that finds call nodes (optional methodFullName, callName, argument code filter), writes JSON to outputFile */
export function scriptFindCalls(
  outputFile: string,
  opts: {
    methodFullNameRegex?: string;
    callNameRegex?: string;
    whereArgumentIndex?: number;
    whereArgumentCodeRegex?: string;
  } = {}
): string {
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  const mfn = opts.methodFullNameRegex?.trim();
  const cname = opts.callNameRegex?.trim();
  const argIdx = typeof opts.whereArgumentIndex === "number" ? opts.whereArgumentIndex : undefined;
  const argCode = opts.whereArgumentCodeRegex?.trim();
  let base = "cpg.call";
  if (mfn) base += `.methodFullName("${esc(mfn)}")`;
  if (cname) base += `.name("${esc(cname)}")`;
  if (typeof argIdx === "number" && argCode) {
    base += `.where(_.argument(${argIdx}).code("${esc(argCode)}"))`;
  } else if (argCode) {
    base += `.where(_.argument(1).code("${esc(argCode)}"))`;
  }
  return [
    "@main def main() = {",
    "  run.ossdataflow",
    "  import java.nio.file.{Files, Paths}",
    '  def escape(s: String) = s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")',
    `  val calls = ${base}.l`,
    "  val arr = calls.map { c =>",
    "    val loc = try c.location catch { case _: Exception => null }",
    '    val fn = if (loc == null) "N/A" else loc.filename',
    "    val ln = c.lineNumber.getOrElse(0)",
    '    s"""{"code":"${escape(c.code)}","lineNumber":$ln,"filename":"${escape(fn)}","methodFullName":"${escape(c.methodFullName)}","methodShortName":"${escape(c.name)}"}"""',
    "  }.mkString(\"[\", \",\", \"]\")",
    `  Files.writeString(Paths.get("${outEsc}"), arr)`,
    `  println("WROTE_FIND_CALLS:" + "${outEsc}")`,
    "}",
  ].join("\n");
}

/** Generate script that lists distinct call names, optionally filtered by methodFullName regex */
export function scriptListCallNames(outputFile: string, methodFullNameRegex?: string): string {
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  const base = methodFullNameRegex?.trim()
    ? `cpg.call.methodFullName("${esc(methodFullNameRegex)}").name`
    : "cpg.call.name";
  return [
    "@main def main() = {",
    "  run.ossdataflow",
    "  import java.nio.file.{Files, Paths}",
    `  val names = ${base}.dedup.sorted.l`,
    '  val arr = "[" + names.map(n => "\\"" + n.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"").mkString(",") + "]"',
    `  Files.writeString(Paths.get("${outEsc}"), arr)`,
    `  println("WROTE_CALL_NAMES:" + "${outEsc}")`,
    "}",
  ].join("\n");
}

/** Generate script that lists methods with name, fullName, filename; optional nameRegex, fullNameRegex */
export function scriptMethods(
  outputFile: string,
  opts: { nameRegex?: string; fullNameRegex?: string } = {}
): string {
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  let base = "cpg.method";
  if (opts.nameRegex?.trim()) base += `.name("${esc(opts.nameRegex.trim())}")`;
  if (opts.fullNameRegex?.trim()) base += `.fullName("${esc(opts.fullNameRegex.trim())}")`;
  return [
    "@main def main() = {",
    "  run.ossdataflow",
    "  import java.nio.file.{Files, Paths}",
    '  def escape(s: String) = s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")',
    `  val methods = ${base}.l`,
    "  val arr = methods.map { m =>",
    '    s"""{"name":"${escape(m.name)}","fullName":"${escape(m.fullName)}","filename":"${escape(m.filename)}"}"""',
    "  }.mkString(\"[\", \",\", \"]\")",
    `  Files.writeString(Paths.get("${outEsc}"), arr)`,
    `  println("WROTE_METHODS:" + "${outEsc}")`,
    "}",
  ].join("\n");
}

/** Generate script that dumps AST/CFG/PDG for methods in flows */
export function scriptDumpGraphs(
  sourceCallName: string,
  sinkCallNamePattern: string,
  outputDir: string,
  outputFile: string,
  graphTypes: string[],
  opts?: {
    sourceMatch?: "exact" | "regex";
    sinkMatch?: "exact" | "regex";
    sourceArgIndex?: number;
    sinkArgIndex?: number;
    methodRegex?: string;
    fileRegex?: string;
    dumpFlowDot?: boolean;
    flowDotDir?: string;
  }
): string {
  const outDirEsc = outputDir.replace(/\\/g, "\\\\");
  const outFileEsc = outputFile.replace(/\\/g, "\\\\");
  const types = graphTypes.map((t) => `"${t}"`).join(", ");
  const sourceMatch = opts?.sourceMatch === "exact" ? "exact" : "regex";
  const sinkMatch = opts?.sinkMatch === "exact" ? "exact" : "regex";
  const sourceArgIndex =
    typeof opts?.sourceArgIndex === "number" ? opts!.sourceArgIndex : undefined;
  const sinkArgIndex =
    typeof opts?.sinkArgIndex === "number" ? opts!.sinkArgIndex : undefined;
  const methodRegex =
    typeof opts?.methodRegex === "string" && opts.methodRegex.trim() !== ""
      ? opts.methodRegex
      : undefined;
  const fileRegex =
    typeof opts?.fileRegex === "string" && opts.fileRegex.trim() !== ""
      ? opts.fileRegex
      : undefined;
  const dumpFlowDot = opts?.dumpFlowDot !== false;
  const flowDotDir = opts?.flowDotDir || outputDir;

  const sourceSelect =
    sourceMatch === "exact"
      ? `cpg.call.nameExact("${esc(sourceCallName)}")`
      : `cpg.call.name("${esc(sourceCallName)}")`;
  const sinkSelect =
    sinkMatch === "exact"
      ? `cpg.call.nameExact("${esc(sinkCallNamePattern)}")`
      : `cpg.call.name("${esc(sinkCallNamePattern)}")`;
  const sourceNode =
    typeof sourceArgIndex === "number"
      ? `sourceCalls.argument(${sourceArgIndex})`
      : "sourceCalls";
  const sinkNode =
    typeof sinkArgIndex === "number"
      ? `sinkCalls.argument(${sinkArgIndex})`
      : "sinkCalls";

  const methodRegexLine = methodRegex
    ? `  val methodRx = "${esc(methodRegex)}".r`
    : `  val methodRx: scala.util.matching.Regex = null`;
  const fileRegexLine = fileRegex
    ? `  val fileRx = "${esc(fileRegex)}".r`
    : `  val fileRx: scala.util.matching.Regex = null`;

  const flowDotDirEsc = flowDotDir.replace(/\\/g, "\\\\");

  return [
    "@main def main() = {",
    "  run.ossdataflow",
    `  val sourceCalls = ${sourceSelect}`,
    `  val sinkCalls   = ${sinkSelect}`,
    `  val source = ${sourceNode}`,
    `  val sink   = ${sinkNode}`,
    "  val flows0  = sink.reachableByFlows(source).l",
    methodRegexLine,
    fileRegexLine,
    "  def keepByMeta(flow: io.joern.dataflowengineoss.language.Path) = {",
    "    if (methodRx == null && fileRx == null) true",
    "    else {",
    "      flow.elements.exists { n =>",
    "        val loc = try n.location catch { case _: Exception => null }",
    "        val m = if (loc == null) \"\" else loc.methodFullName",
    "        val f = if (loc == null) \"\" else loc.filename",
    "        val okM = if (methodRx == null) true else methodRx.findFirstIn(m).nonEmpty",
    "        val okF = if (fileRx == null) true else fileRx.findFirstIn(f).nonEmpty",
    "        okM && okF",
    "      }",
    "    }",
    "  }",
    "  val flows = flows0.filter(keepByMeta)",
    "  import io.shiftleft.codepropertygraph.generated.nodes.CfgNode",
    "  import java.nio.file.{Files, Paths}",
    '  def escape(s: String) = s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")',
    "  val methodsInFlows = flows.flatMap(_.elements).collect { case n: CfgNode => n.method }.distinct.toList",
    `  val outDir = Paths.get("${outDirEsc}")`,
    "  Files.createDirectories(outDir)",
    `  val flowDir = Paths.get("${flowDotDirEsc}")`,
    "  Files.createDirectories(flowDir)",
    "  val written = scala.collection.mutable.ArrayBuffer.empty[String]",
    ...(dumpFlowDot
      ? [
          "  // Dump one DOT per flow path (end-to-end)",
          "  flows.zipWithIndex.foreach { case (flow, i) =>",
          '    val p = flowDir.resolve(s"${i}-flow.dot")',
          '    val sb = new StringBuilder("digraph Flow {\\n  rankdir=LR;\\n  node [shape=box, fontname=\\"Helvetica\\"];\\n")',
          "    val elts = flow.elements.toList",
          "    elts.zipWithIndex.foreach { case (n, j) =>",
          "      val code = try n.asInstanceOf[CfgNode].code catch { case _: Exception => n.toString }",
          "      val loc = try n.location catch { case _: Exception => null }",
          "      val fn = if (loc == null) \"N/A\" else loc.filename",
          "      val ln = try n.lineNumber.getOrElse(0) catch { case _: Exception => 0 }",
          '      val label = escape(s"$j: $code\\n$fn:$ln")',
          '      sb.append(s"""  n$j [label="$label"];\\n""")',
          "      if (j > 0) sb.append(s\"  n${j-1} -> n$j;\\n\")",
          "    }",
          '    sb.append("}\\n")',
          "    Files.writeString(p, sb.toString)",
          "    written += p.toAbsolutePath.toString",
          "  }",
        ]
      : []),
    "  methodsInFlows.zipWithIndex.foreach { case (method, i) =>",
    '    val safeName = method.name.replaceAll("[^a-zA-Z0-9_.-]", "_")',
    "    val prefix   = i + \"-\" + safeName",
    `    if (Seq("ast").exists(x => Seq(${types}).contains(x))) {`,
    "      method.dotAst.headOption.foreach { dot =>",
    '        val p = outDir.resolve(prefix + "-ast.dot")',
    "        Files.writeString(p, dot)",
    "        written += p.toAbsolutePath.toString",
    "      }",
    "    }",
    `    if (Seq("cfg").exists(x => Seq(${types}).contains(x))) {`,
    "      method.dotCfg.headOption.foreach { dot =>",
    '        val p = outDir.resolve(prefix + "-cfg.dot")',
    "        Files.writeString(p, dot)",
    "        written += p.toAbsolutePath.toString",
    "      }",
    "    }",
    `    if (Seq("pdg").exists(x => Seq(${types}).contains(x))) {`,
    "      method.dotPdg.headOption.foreach { dot =>",
    '        val p = outDir.resolve(prefix + "-pdg.dot")',
    "        Files.writeString(p, dot)",
    "        written += p.toAbsolutePath.toString",
    "      }",
    "    }",
    "  }",
    '  val arr = "[" + written.map(w => "\\"" + w.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"").mkString(",") + "]"',
    `  Files.writeString(Paths.get("${outFileEsc}"), arr)`,
    `  println("WROTE_DUMP:" + "${outFileEsc}")`,
    "}",
  ].join("\n");
}

/** Joern frontend names (importCode.xxx). See Joern docs for supported languages. */
const JOERN_IMPORT_NAMES: Record<string, string> = {
  java: "java",
  kotlin: "kotlin",
  jvm: "jvm",
  c: "c",
  cpp: "cpp",
  python: "python",
  golang: "golang",
  go: "golang",
  javascript: "javascript",
  jssrc: "jssrc",
  php: "php",
  ruby: "ruby",
  csharp: "csharp",
  csharpsrc: "csharpsrc",
  swiftsrc: "swiftsrc",
  llvm: "llvm",
  ghidra: "ghidra",
};

/** Generate script that imports code and runs dataflow */
export function scriptImportCode(
  inputPath: string,
  language: string,
  outputFile: string
): string {
  const lang = JOERN_IMPORT_NAMES[language.toLowerCase()] || "java";
  const inputEsc = inputPath.replace(/\\/g, "\\\\");
  const outEsc = outputFile.replace(/\\/g, "\\\\");
  return [
    "@main def main() = {",
    `  importCode.${lang}("${inputEsc}")`,
    "  run.ossdataflow",
    "  val projPath = workspace.getActiveProject.map(_.path.toAbsolutePath.toString).getOrElse(\"\")",
    "  import java.nio.file.{Files, Paths}",
    `  Files.writeString(Paths.get("${outEsc}"), projPath)`,
    `  println("WROTE_IMPORT:" + "${outEsc}")`,
    "}",
  ].join("\n");
}
