import { defectsBySignal, type DefectClass } from 'scvd-defects';

const verdictSignal: string | undefined = defectsBySignal('discovery-info-validates')[0]?.verdict_signal;
const legacy: DefectClass = {
  id: 'consumer-example', title: 'Example', asserts: 'Scope', costs: 'Cost',
  detectable: 'unpaid', our_signal: null, falsified_by: 'Counterexample',
  repair_hint: 'Repair', buyer_hint: 'Buyer action',
};
const extended: DefectClass = { ...legacy, verdict_signal: 'discovery-info-validates' };
void verdictSignal;
void extended;
