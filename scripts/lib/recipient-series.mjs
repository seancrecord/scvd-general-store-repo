// A successful wrapper exit does not establish an uninterrupted native run.
// Missing completion evidence stops the series just as an explicit failure does.
export function recipientCompleted(run) {
  return run?.runtime?.state === 'completed' && run.runtime.exit_code === 0 &&
    run.runtime.budget_stop === null && run.timing?.interruption === null;
}

export async function runRecipientSequence(cells, launch) {
  const results=[];
  for(const [index,cell] of cells.entries()) {
    const run=await launch(cell);
    results.push({cell,runtime:run?.runtime??null,timing:run?.timing??null});
    if(!recipientCompleted(run))return {state:'stopped',results,remaining:cells.slice(index+1)};
  }
  return {state:'completed',results,remaining:[]};
}
