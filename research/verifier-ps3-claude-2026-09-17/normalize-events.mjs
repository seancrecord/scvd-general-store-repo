// Translate host evidence into the original grading vocabulary; retain raw traces.
// Claude's tool error flag is not an exact process exit code. The logger retains that.
export function normalizeClaudeEvents(events) {
  const calls = new Map(), normalized = [];
  for (const event of events) {
    for (const block of event.message?.content ?? []) {
      if (block.type === 'tool_use') calls.set(block.id, block);
      if (block.type !== 'tool_result') continue;
      const call = calls.get(block.tool_use_id);
      if (call?.name !== 'Bash') continue;
      const content = typeof block.content === 'string' ? block.content
        : (block.content ?? []).filter(x => x.type === 'text').map(x => x.text).join('\n');
      const interrupted = event.tool_use_result?.interrupted === true;
      normalized.push({ type: 'item.completed', item: {
        type: 'command_execution', command: call.input.command,
        exit_code: block.is_error === false && !interrupted ? 0 : block.is_error === true || interrupted ? 1 : null,
        exitCodeSource: 'Claude tool error flag (0/1), not exact subprocess code; see verification records',
        aggregated_output: content, sourceToolUseId: block.tool_use_id,
      }});
    }
    if (event.type === 'result' && event.subtype === 'success' && event.is_error === false) normalized.push({type:'turn.completed'});
  }
  return normalized;
}

export function parseClaudeFinal(text) {
  try { return JSON.parse(text.trim()); } catch { /* Allow one explicitly delimited report with surrounding explanation. */ }
  const blocks = [...text.matchAll(/^```(?:json)?\s*\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error('Final response does not contain one unambiguous JSON report');
  return JSON.parse(blocks[0][1]);
}
