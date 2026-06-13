import { JobInput, CalcResult, StopInput } from "./types.js";

function minutesBetween(start: string, end: string): number {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(diffMs / 60000);
}

export function calculate(input: JobInput): CalcResult {
  const { stops, config } = input;
  const flags: string[] = [];
  let needsReview = false;

  // 1.3.3 Guard for incomplete data
  const incompleteFlags: string[] = [];
  for (const stop of stops) {
    if (stop.arrivalAt === null || stop.departureAt === null) {
      incompleteFlags.push(`stop ${stop.sequence} missing arrival or departure`);
    }
  }

  if (incompleteFlags.length > 0) {
    return {
      status: "incomplete",
      flags: incompleteFlags,
      billableMinutes: 0,
      roundedMinutes: 0,
      chargePence: 0,
      perStop: [],
      computedAt: new Date().toISOString()
    };
  }

  const perStopCalc: Array<{
    sequence: number;
    onSiteMinutes: number;
    clockStartAt: string | null;
    billableMinutes: number;
  }> = [];

  let totalBillableRaw = 0;

  for (const stop of stops) {
    const arrivalAt = stop.arrivalAt!;
    const departureAt = stop.departureAt!;
    const bookingSlotAt = stop.bookingSlotAt;

    // 1.3.4 Per-stop on-site time and clock start
    const clockStart = bookingSlotAt
      ? (new Date(arrivalAt).getTime() > new Date(bookingSlotAt).getTime() ? arrivalAt : bookingSlotAt)
      : arrivalAt;

    const onSiteMinutes = minutesBetween(arrivalAt, departureAt);
    let billableRaw = minutesBetween(clockStart, departureAt);

    // 1.3.4 Guard for departure before arrival
    if (new Date(departureAt).getTime() < new Date(arrivalAt).getTime()) {
      flags.push(`stop ${stop.sequence} departure before arrival`);
      needsReview = true;
      billableRaw = 0;
    }

    // Clamp billableRaw to positive numbers
    billableRaw = Math.max(0, billableRaw);

    // 1.3.5 Late-arrival flag
    if (bookingSlotAt && new Date(arrivalAt).getTime() > new Date(bookingSlotAt).getTime()) {
      flags.push(`stop ${stop.sequence}: driver arrived after booking slot — review before claiming`);
      needsReview = true;
    }

    let stopBillableMinutes = 0;
    if (config.freeTimeBasis === "per_stop") {
      stopBillableMinutes = Math.max(0, billableRaw - config.freeTimeMinutes);
    } else {
      stopBillableMinutes = billableRaw;
    }

    totalBillableRaw += billableRaw;

    perStopCalc.push({
      sequence: stop.sequence,
      onSiteMinutes,
      clockStartAt: clockStart,
      billableMinutes: stopBillableMinutes
    });
  }

  // 1.3.6 Apply free time by basis
  let billableMinutes = 0;
  if (config.freeTimeBasis === "per_stop") {
    billableMinutes = perStopCalc.reduce((acc, s) => acc + s.billableMinutes, 0);
  } else {
    billableMinutes = Math.max(0, totalBillableRaw - config.freeTimeMinutes);
  }

  // 1.3.7 Round and price
  let roundedMinutes = billableMinutes;
  if (config.roundingMode === "up") {
    roundedMinutes = Math.ceil(billableMinutes / config.roundingIncrement) * config.roundingIncrement;
  }

  let chargePence = Math.round((roundedMinutes / 60) * config.hourlyRatePence);

  if (config.dailyCapPence !== null && chargePence > config.dailyCapPence) {
    chargePence = config.dailyCapPence;
    flags.push("charge capped at daily cap");
    // Capping is informational, doesn't set needsReview = true by itself
  }

  const status = needsReview ? "flagged" : "calculated";

  return {
    status,
    flags,
    billableMinutes,
    roundedMinutes,
    chargePence,
    perStop: perStopCalc,
    computedAt: new Date().toISOString()
  };
}
