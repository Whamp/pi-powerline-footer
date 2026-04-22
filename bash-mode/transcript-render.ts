import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export function renderTranscriptCommandHeader(
  width: number,
  promptPrefix: string,
  command: string,
  statusSuffix: string,
): string {
  const safeWidth = Math.max(1, width);
  const normalizedCommand = command.replace(/\s+/g, " ").trim();
  const availableCommandWidth = Math.max(
    1,
    safeWidth - visibleWidth(promptPrefix) - visibleWidth(statusSuffix),
  );
  const commandText = truncateToWidth(normalizedCommand, availableCommandWidth, "…");
  return truncateToWidth(`${promptPrefix}${commandText}${statusSuffix}`, safeWidth, "…");
}

export function renderTranscriptLine(width: number, line: string): string {
  return truncateToWidth(line, Math.max(1, width), "…");
}
