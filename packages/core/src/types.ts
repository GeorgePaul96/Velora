export type Minutes = number;          // integer
export type Pence = number;            // integer

export interface StopInput {
  sequence: number;
  bookingSlotAt: string | null; // ISO UTC
  arrivalAt: string | null;     // ISO UTC
  departureAt: string | null;   // ISO UTC
}

export interface JobConfig {
  freeTimeBasis: 'per_job' | 'per_stop';
  freeTimeMinutes: Minutes;     // effective value after override resolution
  hourlyRatePence: Pence;
  roundingIncrement: Minutes;   // 1|5|10|15|30|60
  roundingMode: 'up' | 'exact';
  dailyCapPence: Pence | null;
}

export interface JobInput {
  stops: StopInput[];
  config: JobConfig;
}

export interface CalcResult {
  status: 'calculated' | 'flagged' | 'incomplete';
  flags: string[];                 // human-readable reasons for review
  billableMinutes: Minutes;        // after free time, before rounding
  roundedMinutes: Minutes;
  chargePence: Pence;
  perStop: Array<{
    sequence: number;
    onSiteMinutes: Minutes;
    clockStartAt: string | null;
    billableMinutes: Minutes;
  }>;
  computedAt: string;              // ISO UTC
}
