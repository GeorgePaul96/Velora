import { describe, it, expect } from "vitest";
import { calculate } from "../src/index.js";
import { JobInput } from "../src/types.js";

describe("WTR Core Calculation Engine", () => {
  // Test case 1: Artic, per_job, 120 free, on-site 90 -> charge 0, status calculated.
  it("Case 1: Under free time, per_job, charge 0, calculated", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T10:00:00Z",
          departureAt: "2026-06-13T11:30:00Z" // 90 minutes
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 120,
        hourlyRatePence: 5000, // £50.00
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("calculated");
    expect(result.chargePence).toBe(0);
    expect(result.billableMinutes).toBe(0);
  });

  // Test case 2: Artic, per_job, 120 free, on-site 200, £50/h, round up 15 -> billable 80 -> rounded 90 -> £75.00.
  it("Case 2: Over free time, per_job, rounded up, charge £75.00", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T10:00:00Z",
          departureAt: "2026-06-13T13:20:00Z" // 200 minutes
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 120,
        hourlyRatePence: 5000,
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("calculated");
    expect(result.billableMinutes).toBe(80);
    expect(result.roundedMinutes).toBe(90);
    expect(result.chargePence).toBe(7500); // £75.00
  });

  // Test case 3: Per_stop, two stops 70 and 50, 60 free each, £40/h, round up 15 -> billable (10 + 0)=10 -> rounded 15 -> £10.00.
  it("Case 3: Two stops, per_stop free time, charge £10.00", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T10:00:00Z",
          departureAt: "2026-06-13T11:10:00Z" // 70 minutes -> billable 10
        },
        {
          sequence: 2,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T12:00:00Z",
          departureAt: "2026-06-13T12:50:00Z" // 50 minutes -> billable 0
        }
      ],
      config: {
        freeTimeBasis: "per_stop",
        freeTimeMinutes: 60,
        hourlyRatePence: 4000, // £40.00
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("calculated");
    expect(result.billableMinutes).toBe(10);
    expect(result.roundedMinutes).toBe(15);
    expect(result.chargePence).toBe(1000); // £10.00
  });

  // Test case 4: Booking slot 09:00, arrival 08:30, departure 11:30, 60 free, per_job -> clockStart=09:00 -> billableRaw=150 -> billable 90.
  it("Case 4: Early arrival, clock start at booking slot", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: "2026-06-13T09:00:00Z",
          arrivalAt: "2026-06-13T08:30:00Z",
          departureAt: "2026-06-13T11:30:00Z" // clockStart = 09:00, billableRaw = 150 mins
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 60,
        hourlyRatePence: 4000,
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("calculated");
    expect(result.billableMinutes).toBe(90); // 150 - 60
  });

  // Test case 5: Booking slot 09:00, arrival 09:40 (late), departure 12:00 -> status flagged, flag contains 'arrived after booking slot'.
  it("Case 5: Late arrival raises review flag and statuses flagged", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: "2026-06-13T09:00:00Z",
          arrivalAt: "2026-06-13T09:40:00Z", // Late
          departureAt: "2026-06-13T12:00:00Z"
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 60,
        hourlyRatePence: 4000,
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("flagged");
    expect(result.flags.some(f => f.includes("arrived after booking slot"))).toBe(true);
  });

  // Test case 6: Missing departure on stop 2 -> status incomplete, chargePence absent/0.
  it("Case 6: Missing departure stops calculation, returns incomplete status", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T10:00:00Z",
          departureAt: "2026-06-13T11:00:00Z"
        },
        {
          sequence: 2,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T12:00:00Z",
          departureAt: null // Missing
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 60,
        hourlyRatePence: 4000,
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("incomplete");
    expect(result.chargePence).toBe(0);
    expect(result.flags.some(f => f.includes("stop 2 missing arrival or departure"))).toBe(true);
  });

  // Test case 7: Daily cap £200, computed £250 -> charge £200, flag 'capped'.
  it("Case 7: Charge capped at daily cap limit", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T10:00:00Z",
          departureAt: "2026-06-13T15:00:00Z" // 300 minutes (5 hours) -> £250.00
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 0,
        hourlyRatePence: 5000, // £50.00/hr
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: 20000 // £200.00 cap
      }
    };
    const result = calculate(input);
    expect(result.chargePence).toBe(20000); // £200.00
    expect(result.flags.some(f => f.includes("capped at daily cap"))).toBe(true);
    // Capping should not automatically flag for human review, should remain calculated
    expect(result.status).toBe("calculated");
  });

  // Test case 8: Departure before arrival -> flagged, that stop contributes 0.
  it("Case 8: Departure before arrival raises review flag and stop contributes 0", () => {
    const input: JobInput = {
      stops: [
        {
          sequence: 1,
          bookingSlotAt: null,
          arrivalAt: "2026-06-13T11:00:00Z",
          departureAt: "2026-06-13T10:00:00Z" // Invalid
        }
      ],
      config: {
        freeTimeBasis: "per_job",
        freeTimeMinutes: 0,
        hourlyRatePence: 5000,
        roundingIncrement: 15,
        roundingMode: "up",
        dailyCapPence: null
      }
    };
    const result = calculate(input);
    expect(result.status).toBe("flagged");
    expect(result.flags.some(f => f.includes("departure before arrival"))).toBe(true);
    expect(result.billableMinutes).toBe(0);
    expect(result.chargePence).toBe(0);
  });
});
