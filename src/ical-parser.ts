import { requestUrl } from 'obsidian';
import { CalendarEvent, CalendarSource } from './types';

/**
 * Simple iCal parser for extracting events
 * Handles VEVENT parsing and basic recurrence
 */
export class ICalParser {
  private cache: Map<string, { data: string; timestamp: number }> = new Map();
  private cacheDurationMs: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Normalize URL (convert webcal to https)
   */
  private normalizeUrl(url: string): string {
    if (url.startsWith('webcal://')) {
      return 'https://' + url.slice('webcal://'.length);
    }
    return url;
  }

  /**
   * Fetch events from multiple calendar sources
   */
  async fetchAllEvents(
    sources: CalendarSource[],
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const allEvents: CalendarEvent[] = [];

    for (const source of sources) {
      if (!source.enabled || !source.url) continue;

      try {
        const events = await this.fetchEvents(source.url, source.name, startDate, endDate);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Failed to fetch calendar ${source.name}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Fetch and parse events from a single iCal URL
   */
  async fetchEvents(
    url: string,
    calendarName: string,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const icalText = await this.fetchICalData(url);
    return this.parseICalData(icalText, calendarName, startDate, endDate);
  }

  /**
   * Fetch iCal data with caching
   */
  private async fetchICalData(url: string): Promise<string> {
    const normalizedUrl = this.normalizeUrl(url);
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(normalizedUrl);
    if (cached && now - cached.timestamp < this.cacheDurationMs) {
      return cached.data;
    }

    try {
      const response = await requestUrl({
        url: normalizedUrl,
        method: 'GET',
      });

      const data = response.text;
      this.cache.set(normalizedUrl, { data, timestamp: now });
      return data;
    } catch (error) {
      console.error('Failed to fetch iCal data:', error);
      throw new Error(`Failed to fetch calendar: ${error}`);
    }
  }

  /**
   * Parse iCal text into CalendarEvent array
   */
  private parseICalData(
    icalText: string,
    calendarName: string,
    startDate: Date,
    endDate: Date
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icalText.split(/\r?\n/);

    let currentEvent: Partial<CalendarEvent> | null = null;
    let inEvent = false;
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      // Handle line continuations (lines starting with space or tab)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentValue += line.substring(1);
        continue;
      }

      // Process previous key-value pair
      if (currentKey && currentEvent) {
        this.processProperty(currentEvent, currentKey, currentValue);
      }

      // Parse new line
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      currentKey = line.substring(0, colonIndex);
      currentValue = line.substring(colonIndex + 1);

      if (line.startsWith('BEGIN:VEVENT')) {
        inEvent = true;
        currentEvent = {
          calendarName,
        };
        currentKey = '';
      } else if (line.startsWith('END:VEVENT')) {
        // Process final property
        if (currentKey && currentEvent) {
          this.processProperty(currentEvent, currentKey, currentValue);
        }

        if (currentEvent && currentEvent.start && currentEvent.end) {
          const event = currentEvent as CalendarEvent;

          // Check if event is in range
          if (this.isInRange(event, startDate, endDate)) {
            events.push(event);
          }

          // Handle recurring events
          if ((currentEvent as any).rrule) {
            const expanded = this.expandRecurrence(
              event,
              (currentEvent as any).rrule,
              startDate,
              endDate
            );
            events.push(...expanded);
          }
        }

        inEvent = false;
        currentEvent = null;
        currentKey = '';
      }
    }

    return events;
  }

  /**
   * Process a single iCal property
   */
  private processProperty(event: Partial<CalendarEvent>, key: string, value: string): void {
    // Remove parameters from key (e.g., DTSTART;TZID=America/New_York)
    const baseKey = key.split(';')[0];

    switch (baseKey) {
      case 'UID':
        event.id = value;
        break;
      case 'SUMMARY':
        event.title = this.unescapeText(value);
        break;
      case 'DTSTART':
        const startResult = this.parseDateTime(key, value);
        event.start = startResult.date;
        event.isAllDay = startResult.isAllDay;
        break;
      case 'DTEND':
        event.end = this.parseDateTime(key, value).date;
        break;
      case 'RRULE':
        (event as any).rrule = value;
        break;
    }
  }

  /**
   * Parse iCal date/time value
   */
  private parseDateTime(key: string, value: string): { date: Date; isAllDay: boolean } {
    const isAllDay = key.includes('VALUE=DATE') || value.length === 8;

    if (isAllDay) {
      // All-day event: YYYYMMDD
      const year = parseInt(value.substring(0, 4));
      const month = parseInt(value.substring(4, 6)) - 1;
      const day = parseInt(value.substring(6, 8));
      return { date: new Date(year, month, day), isAllDay: true };
    }

    // DateTime: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    const isUtc = value.endsWith('Z');
    const cleanValue = value.replace('Z', '');

    const year = parseInt(cleanValue.substring(0, 4));
    const month = parseInt(cleanValue.substring(4, 6)) - 1;
    const day = parseInt(cleanValue.substring(6, 8));
    const hour = parseInt(cleanValue.substring(9, 11));
    const minute = parseInt(cleanValue.substring(11, 13));
    const second = parseInt(cleanValue.substring(13, 15)) || 0;

    let date: Date;
    if (isUtc) {
      date = new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      // Try to extract timezone from key
      const tzMatch = key.match(/TZID=([^:;]+)/);
      if (tzMatch) {
        // Create date in local time, then adjust
        // This is a simplification - full timezone support would need a library
        date = new Date(year, month, day, hour, minute, second);
      } else {
        date = new Date(year, month, day, hour, minute, second);
      }
    }

    return { date, isAllDay: false };
  }

  /**
   * Unescape iCal text values
   */
  private unescapeText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Check if event overlaps with date range
   */
  private isInRange(event: CalendarEvent, startDate: Date, endDate: Date): boolean {
    return event.end > startDate && event.start < endDate;
  }

  /**
   * Expand recurring events within date range
   */
  private expandRecurrence(
    event: CalendarEvent,
    rrule: string,
    startDate: Date,
    endDate: Date
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const parts = this.parseRRule(rrule);

    if (!parts.freq) return events;

    // For WEEKLY with BYDAY, we need special handling
    if (parts.freq === 'WEEKLY' && parts.byday && parts.byday.length > 0) {
      return this.expandWeeklyWithByday(event, parts, startDate, endDate);
    }

    const eventDuration = event.end.getTime() - event.start.getTime();
    let current = new Date(event.start);
    let count = 0;
    const maxIterations = 365;

    // Skip original event (already added)
    current = this.getNextOccurrence(current, parts);

    while (current < endDate && count < maxIterations) {
      if (parts.until && current > parts.until) break;
      if (parts.count && count >= parts.count - 1) break;

      if (current >= startDate) {
        events.push({
          id: `${event.id}-${current.getTime()}`,
          title: event.title,
          start: new Date(current),
          end: new Date(current.getTime() + eventDuration),
          isAllDay: event.isAllDay,
          calendarName: event.calendarName,
        });
      }

      current = this.getNextOccurrence(current, parts);
      count++;
    }

    return events;
  }

  /**
   * Expand weekly events with BYDAY (e.g., every Tuesday and Thursday)
   */
  private expandWeeklyWithByday(
    event: CalendarEvent,
    parts: { freq?: string; interval?: number; until?: Date; count?: number; byday?: string[] },
    startDate: Date,
    endDate: Date
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const eventDuration = event.end.getTime() - event.start.getTime();
    const interval = parts.interval || 1;

    // Map day abbreviations to day numbers (0 = Sunday)
    const dayMap: Record<string, number> = {
      'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
    };

    const targetDays = (parts.byday || [])
      .map(d => dayMap[d.replace(/^-?\d/, '')])  // Handle things like "2TU" (second Tuesday)
      .filter(d => d !== undefined);

    if (targetDays.length === 0) return events;

    // Start from the beginning of the week of the original event
    let weekStart = new Date(event.start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);

    let count = 0;
    const maxIterations = 365;

    while (weekStart < endDate && count < maxIterations) {
      for (const targetDay of targetDays) {
        const occurrence = new Date(weekStart);
        occurrence.setDate(occurrence.getDate() + targetDay);

        // Skip the original event
        if (occurrence.getTime() === event.start.getTime()) continue;

        // Check bounds
        if (parts.until && occurrence > parts.until) continue;
        if (occurrence < event.start) continue;  // Don't go before original
        if (occurrence >= endDate) continue;

        if (occurrence >= startDate) {
          events.push({
            id: `${event.id}-${occurrence.getTime()}`,
            title: event.title,
            start: new Date(occurrence),
            end: new Date(occurrence.getTime() + eventDuration),
            isAllDay: event.isAllDay,
            calendarName: event.calendarName,
          });
        }
      }

      // Move to next week (respecting interval)
      weekStart.setDate(weekStart.getDate() + 7 * interval);
      count++;
    }

    return events;
  }

  /**
   * Parse RRULE string
   */
  private parseRRule(rrule: string): {
    freq?: string;
    interval?: number;
    until?: Date;
    count?: number;
    byday?: string[];
  } {
    const result: any = {};
    const parts = rrule.split(';');

    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'FREQ':
          result.freq = value;
          break;
        case 'INTERVAL':
          result.interval = parseInt(value);
          break;
        case 'UNTIL':
          result.until = this.parseDateTime('DTSTART', value).date;
          break;
        case 'COUNT':
          result.count = parseInt(value);
          break;
        case 'BYDAY':
          result.byday = value.split(',');
          break;
      }
    }

    return result;
  }

  /**
   * Get next occurrence based on RRULE
   */
  private getNextOccurrence(
    current: Date,
    parts: { freq?: string; interval?: number; byday?: string[] }
  ): Date {
    const next = new Date(current);
    const interval = parts.interval || 1;

    switch (parts.freq) {
      case 'DAILY':
        next.setDate(next.getDate() + interval);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + 7 * interval);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + interval);
        break;
    }

    return next;
  }
}
