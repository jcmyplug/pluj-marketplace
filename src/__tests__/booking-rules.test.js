/* @vitest-environment jsdom */

/* ─── BOOKING RULE TESTS ────────────────────────────────────────────────────
   The first frontend tests in this project. They cover the pure decision
   functions rather than rendering, because these are where the bugs have
   actually been, and because a rule is cheap to assert and a screen is not.

   jsdom is used only because importing the module touches window at load;
   nothing below renders anything.
────────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import {
  blockForTime,
  blocksForSpan,
  vendorConflicts,
  parseSchedule,
  fmtTime12,
  fmtTimeRange,
  matchesEventType,
  parseEventTypes,
} from "../PlujMarketplace.jsx";

/* Far enough ahead that the past-date and minimum-notice checks never fire. */
const FUTURE = "2030-06-14";
const FREE = { blocked: [], confirmed: [] };

describe("blockForTime", function () {
  it("puts each hour in the right block", function () {
    expect(blockForTime("06:00")).toBe("Morning");
    expect(blockForTime("11:59")).toBe("Morning");
    expect(blockForTime("12:00")).toBe("Afternoon");
    expect(blockForTime("17:00")).toBe("Evening");
    expect(blockForTime("22:00")).toBe("Late night");
    expect(blockForTime("03:00")).toBe("Late night");
  });

  it("returns null for anything that is not a time", function () {
    expect(blockForTime("")).toBe(null);
    expect(blockForTime("later")).toBe(null);
  });
});

describe("blocksForSpan", function () {
  it("covers every block the booking runs through", function () {
    expect(blocksForSpan("09:00", "23:00"))
      .toEqual(["Morning", "Afternoon", "Evening", "Late night"]);
  });

  it("does not count an end landing exactly on the hour", function () {
    /* 7pm-10pm is Evening, full stop. 10pm is where Late night STARTS, and a
       booking that ends then never occupies it. */
    expect(blocksForSpan("19:00", "22:00")).toEqual(["Evening"]);
    expect(blocksForSpan("19:00", "22:30")).toEqual(["Evening", "Late night"]);
  });

  it("handles a booking that runs past midnight", function () {
    expect(blocksForSpan("22:00", "01:00")).toEqual(["Late night"]);
    expect(blocksForSpan("22:00", "07:00")).toEqual(["Late night", "Morning"]);
  });

  it("falls back to the starting block when there is no end time", function () {
    expect(blocksForSpan("21:00", "")).toEqual(["Evening"]);
  });
});

describe("vendorConflicts", function () {
  const eveningOnly = { schedule: "Every day · Evening" };

  it("allows a booking that stays inside the hours the vendor works", function () {
    expect(vendorConflicts(eveningOnly, FREE, FUTURE, "19:00", "22:00")).toEqual([]);
  });

  it("REGRESSION: rejects a booking that starts inside those hours but runs past them", function () {
    /* This is the bug this test exists for. The check used to look only at the
       start time, so 8pm-1am passed for an evenings-only vendor because it
       STARTS in the evening. It runs through Late night too. */
    const reasons = vendorConflicts(eveningOnly, FREE, FUTURE, "20:00", "01:00");
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.join(" ")).toContain("late night");
  });

  it("reports a blocked date", function () {
    const avail = { blocked: [FUTURE], confirmed: [] };
    expect(vendorConflicts(eveningOnly, avail, FUTURE, "19:00", "22:00"))
      .toContain("has that date blocked");
  });

  it("reports a date already booked", function () {
    const avail = { blocked: [], confirmed: [FUTURE] };
    expect(vendorConflicts(eveningOnly, avail, FUTURE, "19:00", "22:00"))
      .toContain("is already booked that date");
  });

  it("reports a weekday the vendor does not work", function () {
    /* 14 June 2030 is a Friday. */
    const mondaysOnly = { schedule: "Mon · Evening" };
    expect(vendorConflicts(mondaysOnly, FREE, FUTURE, "19:00", "22:00").join(" "))
      .toContain("Friday");
  });

  it("says nothing at all when there is no date to check", function () {
    expect(vendorConflicts(eveningOnly, FREE, "", "19:00", "22:00")).toEqual([]);
  });
});

describe("parseSchedule", function () {
  it("reads days and blocks out of the composed format", function () {
    const parsed = parseSchedule("Fri, Sat · Late night");
    expect(parsed.days).toEqual(["Fri", "Sat"]);
    expect(parsed.blocks).toEqual(["Late night"]);
  });

  it("expands Every day", function () {
    expect(parseSchedule("Every day · Evening").days).toHaveLength(7);
  });

  it("returns nulls for legacy free text so it never blocks a booking", function () {
    expect(parseSchedule("weekends mostly")).toEqual({ days: null, blocks: null });
    expect(parseSchedule("")).toEqual({ days: null, blocks: null });
    expect(parseSchedule(null)).toEqual({ days: null, blocks: null });
  });
});

describe("time formatting", function () {
  it("formats 24-hour times for people", function () {
    expect(fmtTime12("00:00")).toBe("12:00 AM");
    expect(fmtTime12("12:00")).toBe("12:00 PM");
    expect(fmtTime12("13:30")).toBe("1:30 PM");
    expect(fmtTime12("23:59")).toBe("11:59 PM");
  });

  it("drops a missing half of a range instead of printing a dangling dash", function () {
    expect(fmtTimeRange("19:00", "23:00")).toBe("7:00 PM – 11:00 PM");
    expect(fmtTimeRange("19:00", "")).toBe("7:00 PM");
    expect(fmtTimeRange("", "")).toBe("");
  });
});

describe("event type matching", function () {
  it("parses tags from an array or a JSON string", function () {
    expect(parseEventTypes(["wedding"])).toEqual(["wedding"]);
    expect(parseEventTypes(JSON.stringify(["wedding", "quince"])))
      .toEqual(["wedding", "quince"]);
    expect(parseEventTypes("not json")).toEqual([]);
    expect(parseEventTypes(null)).toEqual([]);
  });

  it("treats a vendor with no tags as serving everything", function () {
    /* Deliberate: vendors are not hidden until they opt in. */
    expect(matchesEventType({ eventTypes: [] }, "wedding")).toBe(true);
    expect(matchesEventType({}, "wedding")).toBe(true);
  });

  it("respects tags once a vendor has set them", function () {
    const v = { eventTypes: ["corporate"] };
    expect(matchesEventType(v, "corporate")).toBe(true);
    expect(matchesEventType(v, "wedding")).toBe(false);
  });
});
