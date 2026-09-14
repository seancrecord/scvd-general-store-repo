// Qualification thresholds. A deployment must choose and exercise its own cadence.
export const ATTENTION_LIMITS=Object.freeze({reservationAgeMs:300000,holdAgeMs:300000,retentionWarningPercent:90,maxReadingAgeMs:60000,readTimeoutMs:5000});
export const ATTENTION_MESSAGES=Object.freeze({
  admissions_held:'New screening admissions are held for an operator review.',
  hold_aging:'The screening admission hold needs attention. Inspect its review before deciding what to do.',
  reservations_aging:'Screening reservations exceed the review-age threshold. Age does not prove that work stopped.',
  reservation_time_unknown:'An active screening reservation has no recorded start time. Inspect it; do not expire it automatically.',
  paid_capacity_exhausted:'The current pair budget cannot admit another paid request. Inspect credits, request limits and active slots.',
  free_capacity_exhausted:'The current free allowance is exhausted. Paid capacity is reported separately.',
  recovery_storage_near_limit:'The recovery case register is near its fixed limit. Arrange a verified export and reviewed retention migration.',
  recovery_storage_full:'The recovery case register is full. New reviews are refused; existing reviews remain available.',
});
export type AttentionCode=keyof typeof ATTENTION_MESSAGES;
export interface AttentionReading {
  status:'ok';observedAtMs:number;policyId:string;
  signals:AttentionCode[];
  counts:{active:number;aging:number;unknownAge:number;retainedCases:number;maxCases:number};
  hold:{caseId:string;ageMs:number}|null;
  capacity:{paid:boolean;free:boolean;accountingWindow:number;projectedRollover:boolean};
  limits:typeof ATTENTION_LIMITS;
  assurance:'operational_reading_not_termination_evidence';
}
