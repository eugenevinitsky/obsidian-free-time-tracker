/**
 * A calendar source configuration
 */
export interface CalendarSource {
  url: string;
  name: string;
  enabled: boolean;
}

/**
 * Plugin settings stored in data.json
 */
export interface FreeTimeTrackerSettings {
  // Calendar sources (multiple supported)
  calendarSources: CalendarSource[];
  useFullCalendarConfig: boolean;

  // Time window configuration
  trackingStartHour: number;
  trackingEndHour: number;
  includeWeekends: boolean;

  // Event filtering
  excludedKeywords: string[];

  // Warning thresholds
  warningThresholdHours: number;
  criticalThresholdHours: number;

  // Display preferences
  showStatusBar: boolean;
  showWarningModal: boolean;
  showWarningNotice: boolean;

  // Refresh configuration
  refreshIntervalMinutes: number;
  lookaheadDays: number;

  // Cache
  lastFetchTimestamp: number;
  cachedFreeTimeHours: number | null;
}

/**
 * Parsed calendar event from iCal
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  calendarName?: string;
}

/**
 * Time block (busy or free)
 */
export interface TimeBlock {
  start: Date;
  end: Date;
  durationMinutes: number;
  type: 'busy' | 'free';
}

/**
 * Result of free time calculation
 */
export interface FreeTimeResult {
  totalTrackableHours: number;
  scheduledHours: number;
  freeHours: number;
  percentageFree: number;
  periodStart: Date;
  periodEnd: Date;
  busyBlocks: TimeBlock[];
  warningLevel: 'none' | 'warning' | 'critical';
}

/**
 * Full Calendar plugin configuration format
 */
export interface FullCalendarConfig {
  calendarSources: Array<{
    type: 'local' | 'ical' | 'caldav' | 'icloud' | 'dailynote';
    url?: string;
    color?: string;
    directory?: string;
  }>;
}
