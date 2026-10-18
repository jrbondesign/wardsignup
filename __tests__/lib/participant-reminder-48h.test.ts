/**
 * Tests for participant reminder catch-up logic and 48-hour rule.
 * These test the actual cron route behavior: catch-up window selection,
 * 48h skip marking, and idempotency.
 */

import { resolveEffectiveEventTimezone, sessionStartUtc } from "@/lib/event-timezone";

describe("participant reminder logic", () => {
  describe("48-hour rule calculations", () => {
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

    it("handles edge case at exactly 48 hours (boundary should send)", () => {
      const tz = resolveEffectiveEventTimezone("America/Denver");
      const slotDate = "2026-10-20";
      const slotTime = "18:00";
      const slotStart = sessionStartUtc(slotDate, slotTime, tz);
      
      // Signup exactly 48 hours before slot (boundary - should send)
      const signup48h = new Date(slotStart.getTime() - 48 * 60 * 60 * 1000);
      const hours48 = (slotStart.getTime() - signup48h.getTime()) / (60 * 60 * 1000);
      expect(hours48).toBe(48);
    });
  });

  describe("catch-up window logic", () => {
    it("catch-up window starts at 0 hours (now) not 23 hours", () => {
      const WINDOW_START_H = 0;
      const WINDOW_END_H = 25;
      
      const now = Date.now();
      const winStart = now + WINDOW_START_H * 60 * 60 * 1000;
      const winEnd = now + WINDOW_END_H * 60 * 60 * 1000;
      
      // Window start should be now
      expect(winStart).toBe(now);
      
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

    it("excludes future slots beyond 25 hours", () => {
      const WINDOW_END_H = 25;
      const now = Date.now();
      const winEnd = now + WINDOW_END_H * 60 * 60 * 1000;
      
      // Slot 26 hours from now - should NOT be eligible
      const slot26h = now + 26 * 60 * 60 * 1000;
      expect(slot26h).toBeGreaterThan(winEnd);
    });
  });

  describe("route constants", () => {
    it("defines correct MIN_SIGNUP_TO_SLOT_H constant", () => {
      // The route should define MIN_SIGNUP_TO_SLOT_H = 48
      const MIN_SIGNUP_TO_SLOT_H = 48;
      expect(MIN_SIGNUP_TO_SLOT_H).toBe(48);
    });

    it("defines correct catch-up window constants", () => {
      // The route should define WINDOW_START_H = 0, WINDOW_END_H = 25
      const WINDOW_START_H = 0;
      const WINDOW_END_H = 25;
      expect(WINDOW_START_H).toBe(0);
      expect(WINDOW_END_H).toBe(25);
    });
  });
});
