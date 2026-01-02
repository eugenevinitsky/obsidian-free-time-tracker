import { CalendarEvent, FreeTimeResult, FreeTimeTrackerSettings, TimeBlock } from './types';

export class TimeCalculator {
  private settings: FreeTimeTrackerSettings;

  constructor(settings: FreeTimeTrackerSettings) {
    this.settings = settings;
  }

  /**
   * Update settings
   */
  updateSettings(settings: FreeTimeTrackerSettings): void {
    this.settings = settings;
  }

  /**
   * Calculate free time for the configured period
   */
  calculateFreeTime(events: CalendarEvent[]): FreeTimeResult {
    const now = new Date();
    const periodStart = this.getStartOfTrackingPeriod(now);
    const periodEnd = this.getEndOfTrackingPeriod(now);

    // Get all trackable days
    const trackableDays = this.getTrackableDays(periodStart, periodEnd);

    // Calculate total trackable hours
    const hoursPerDay = this.settings.trackingEndHour - this.settings.trackingStartHour;
    const totalTrackableHours = trackableDays.length * hoursPerDay;

    // Filter out excluded events
    const filteredEvents = this.filterExcludedEvents(events);

    // Filter events to only those within tracking windows
    const relevantEvents = this.filterEventsToTrackingWindows(filteredEvents, trackableDays);

    // Merge overlapping events and calculate busy time
    const busyBlocks = this.calculateBusyBlocks(relevantEvents);
    const scheduledMinutes = busyBlocks.reduce(
      (sum, block) => sum + block.durationMinutes,
      0
    );
    const scheduledHours = scheduledMinutes / 60;

    // Calculate free time
    const freeHours = Math.max(0, totalTrackableHours - scheduledHours);
    const percentageFree =
      totalTrackableHours > 0 ? (freeHours / totalTrackableHours) * 100 : 0;

    // Determine warning level
    const warningLevel = this.getWarningLevel(freeHours);

    return {
      totalTrackableHours,
      scheduledHours,
      freeHours,
      percentageFree,
      periodStart,
      periodEnd,
      busyBlocks,
      warningLevel,
    };
  }

  /**
   * Filter out events matching excluded keywords
   */
  private filterExcludedEvents(events: CalendarEvent[]): CalendarEvent[] {
    const keywords = this.settings.excludedKeywords || [];
    if (keywords.length === 0) return events;

    return events.filter(event => {
      const title = (event.title || '').toLowerCase();
      return !keywords.some(keyword =>
        title.includes(keyword.toLowerCase())
      );
    });
  }

  /**
   * Get start of tracking period (beginning of today)
   */
  private getStartOfTrackingPeriod(now: Date): Date {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  /**
   * Get end of tracking period based on lookahead days
   */
  private getEndOfTrackingPeriod(now: Date): Date {
    const end = new Date(now);
    end.setDate(end.getDate() + this.settings.lookaheadDays);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  /**
   * Get list of trackable days (respecting weekend setting)
   */
  private getTrackableDays(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (this.settings.includeWeekends || !isWeekend) {
        days.push(new Date(current));
      }

      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Filter events to only include portions within tracking windows
   */
  private filterEventsToTrackingWindows(
    events: CalendarEvent[],
    trackableDays: Date[]
  ): CalendarEvent[] {
    const filteredEvents: CalendarEvent[] = [];

    for (const event of events) {
      // Skip all-day events - they don't consume specific hours
      if (event.isAllDay) continue;

      for (const day of trackableDays) {
        const windowStart = new Date(day);
        windowStart.setHours(this.settings.trackingStartHour, 0, 0, 0);

        const windowEnd = new Date(day);
        windowEnd.setHours(this.settings.trackingEndHour, 0, 0, 0);

        // Check if event overlaps with this day's window
        if (event.start < windowEnd && event.end > windowStart) {
          // Clip event to window boundaries
          const clippedStart = new Date(
            Math.max(event.start.getTime(), windowStart.getTime())
          );
          const clippedEnd = new Date(
            Math.min(event.end.getTime(), windowEnd.getTime())
          );

          filteredEvents.push({
            ...event,
            id: `${event.id}-${day.toISOString().slice(0, 10)}`,
            start: clippedStart,
            end: clippedEnd,
          });
        }
      }
    }

    return filteredEvents;
  }

  /**
   * Merge overlapping events into busy blocks
   */
  private calculateBusyBlocks(events: CalendarEvent[]): TimeBlock[] {
    if (events.length === 0) return [];

    // Sort events by start time
    const sorted = [...events].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

    const blocks: TimeBlock[] = [];
    let currentBlock: TimeBlock | null = null;

    for (const event of sorted) {
      if (!currentBlock) {
        currentBlock = {
          start: event.start,
          end: event.end,
          durationMinutes: 0,
          type: 'busy',
        };
      } else if (event.start <= currentBlock.end) {
        // Overlapping - extend current block
        currentBlock.end = new Date(
          Math.max(currentBlock.end.getTime(), event.end.getTime())
        );
      } else {
        // Non-overlapping - save current and start new
        currentBlock.durationMinutes =
          (currentBlock.end.getTime() - currentBlock.start.getTime()) / 60000;
        blocks.push(currentBlock);

        currentBlock = {
          start: event.start,
          end: event.end,
          durationMinutes: 0,
          type: 'busy',
        };
      }
    }

    // Don't forget the last block
    if (currentBlock) {
      currentBlock.durationMinutes =
        (currentBlock.end.getTime() - currentBlock.start.getTime()) / 60000;
      blocks.push(currentBlock);
    }

    return blocks;
  }

  /**
   * Determine warning level based on free hours
   */
  private getWarningLevel(freeHours: number): 'none' | 'warning' | 'critical' {
    if (freeHours <= this.settings.criticalThresholdHours) {
      return 'critical';
    }
    if (freeHours <= this.settings.warningThresholdHours) {
      return 'warning';
    }
    return 'none';
  }
}
