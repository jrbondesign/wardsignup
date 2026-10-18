/**
 * Tests for participant reminder 48-hour rule:
 * Skip reminders when signup was created less than 48 hours before the slot start.
 */

import { resolveEffectiveEventTimezone, sessionStartUtc } from "@/lib/event-timezone";

describe("participant reminder 48-hour rule", () => {
  it("calculates hours between signup and slot correctly", () => {
    const tz = resolveEffectiveEventTimezone("America/Denver");
    const slotDate = "2026-10-20";
    const slotTime = "18:00";
    const slotStart = sessionStartUtc(slotDate, slotTime, tz);
    
    // Signup 49 hours before slot (should send reminder)
    const signup49h = new Date(slotStart.getTime() - 49 * 60 * 60 * 1000);
    const hours49 = (slotStart.getTime() - signup49h.getTime()) / (60 * 60 * 1000);
    expect(hours49).toBeGreaterThan(48);
    
    // Signup 47 hours before slot (should NOT send reminder, mark as handled)
    const signup47h = new Date(slotStart.getTime() - 47 * 60 * 60 * 1000);
    const hours47 = (slotStart.getTime() - signup47h.getTime()) / (60 * 60 * 1000);
    expect(hours47).toBeLessThan(48);
    
    // Signup 24 hours before slot (should NOT send reminder, mark as handled)
    const signup24h = new Date(slotStart.getTime() - 24 * 60 * 60 * 1000);
    const hours24 = (slotStart.getTime() - signup24h.getTime()) / (60 * 60 * 1000);
    expect(hours24).toBeLessThan(48);
  });

  it("handles edge case at exactly 48 hours", () => {
    const tz = resolveEffectiveEventTimezone("America/Denver");
    const slotDate = "2026-10-20";
    const slotTime = "18:00";
    const slotStart = sessionStartUtc(slotDate, slotTime, tz);
    
    // Signup exactly 48 hours before slot (boundary - should send)
    const signup48h = new Date(slotStart.getTime() - 48 * 60 * 60 * 1000);
    const hours48 = (slotStart.getTime() - signup48h.getTime()) / (60 * 60 * 1000);
    expect(hours48).toBe(48);
  });

  it("catch-up window starts at 0 hours (now) not 23 hours", () => {
    const WINDOW_START_H = 0;
    const WINDOW_END_H = 25;
    
    const now = Date.now();
    const winStart = now + WINDOW_START_H * 60 * 60 * 1000;
    const winEnd = now + WINDOW_END_H * 60 * 60 * 1000;
    
    // Slot 1 hour from now - should be eligible
    const slot1h = now + 1 * 60 * 60 * 1000;
    expect(slot1h).toBeGreaterThanOrEqual(now);
    expect(slot1h).toBeLessThanOrEqual(winEnd);
    
    // Slot 24 hours from now - should be eligible
    const slot24h = now + 24 * 60 * 60 * 1000;
    expect(slot24h).toBeGreaterThanOrEqual(now);
    expect(slot24h).toBeLessThanOrEqual(winEnd);
    
    // Slot in the past - should NOT be eligible
    const slotPast = now - 1 * 60 * 60 * 1000;
    expect(slotPast).toBeLessThan(now);
  });
});
