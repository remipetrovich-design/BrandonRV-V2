import {inflateRawSync} from "node:zlib";
export const ACTIVE_WORKFLOW_STATES = new Set(["queued","in_progress","waiting","requested","pending"]);
export function isWorkflowActive(status) {
  return ACTIVE_WORKFLOW_STATES.has(String(status ?? "").toLowerCase());
}
export function tailConsoleOutput(value, maxLines = 500, maxChars = 50000) {
  const clean = String(value ?? "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/(postgres(?:ql)?:\/\/)[^\s"'<>]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[redacted]");
  const lines = clean.split(/\r?\n/);
  const tail = lines.slice(-maxLines).join("\n");
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}
export function extractConsoleErrors(value, maxErrors = 12) {
  const matches = String(value ?? "").split(/\r?\n/).filter(line =>
    /::error::|\bERROR:\s|\bError:|\bfatal:\s|migration .* failed|failed to (apply|run|execute)/i.test(line)
  );
  return [...new Set(matches.map(line => line.trim()).filter(Boolean))].slice(-maxErrors);
}
export function extractZipText(input) {
  const bytes = Buffer.from(input);
  let end = -1;
  for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset++) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) end = offset;
  }
  if (end < 0) throw new Error("GitHub returned an invalid job-log archive.");
  const entries = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const output = [];
  for (let index = 0; index < entries; index++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("GitHub job-log archive directory is invalid.");
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = inflateRawSync(compressed);
    else throw new Error("Unsupported GitHub job-log compression method: " + method);
    if (/\.txt$/i.test(name)) output.push("===== " + name + " =====\n" + content.toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return output.join("\n\n") || "No text log files were included in this job archive.";
}
