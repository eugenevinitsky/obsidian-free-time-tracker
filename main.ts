import { Notice, Plugin } from 'obsidian';
import { FreeTimeTrackerSettings, FreeTimeResult, FullCalendarConfig } from './src/types';
import { DEFAULT_SETTINGS, FreeTimeTrackerSettingTab } from './src/settings';
import { ICalParser } from './src/ical-parser';
import { TimeCalculator } from './src/time-calculator';
import { FreeTimeStatusBar } from './src/status-bar';
import { FreeTimeWarningModal } from './src/warning-modal';

export default class FreeTimeTrackerPlugin extends Plugin {
  settings: FreeTimeTrackerSettings;

  private statusBar: FreeTimeStatusBar | null = null;
  private statusBarEl: HTMLElement | null = null;
  private refreshIntervalId: number | null = null;
  private lastWarningDismissDate: string | null = null;
  private icalParser: ICalParser;
  private timeCalculator: TimeCalculator;

  async onload(): Promise<void> {
    console.log('Loading Free Time Tracker plugin');

    // Load settings
    await this.loadSettings();

    // Initialize components
    this.icalParser = new ICalParser();
    this.timeCalculator = new TimeCalculator(this.settings);

    // Initialize status bar
    if (this.settings.showStatusBar) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBar = new FreeTimeStatusBar(this.statusBarEl, () => this.showDetailsModal());
    }

    // Add settings tab
    this.addSettingTab(new FreeTimeTrackerSettingTab(this.app, this));

    // Add commands
    this.addCommand({
      id: 'refresh-free-time',
      name: 'Refresh free time calculation',
      callback: () => this.refreshFreeTime(),
    });

    this.addCommand({
      id: 'show-free-time-details',
      name: 'Show free time details',
      callback: () => this.showDetailsModal(),
    });

    // Try to import calendars from full-calendar if enabled and no sources yet
    if (this.settings.useFullCalendarConfig && this.settings.calendarSources.length === 0) {
      await this.importFromFullCalendar();
    }

    // Start refresh interval
    this.startRefreshInterval();

    // Initial fetch (with a small delay to let Obsidian fully load)
    setTimeout(() => this.refreshFreeTime(), 2000);
  }

  onunload(): void {
    console.log('Unloading Free Time Tracker plugin');
    this.stopRefreshInterval();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // Update calculator with new settings
    if (this.timeCalculator) {
      this.timeCalculator.updateSettings(this.settings);
    }
  }

  /**
   * Import calendar sources from obsidian-full-calendar plugin
   */
  async importFromFullCalendar(): Promise<void> {
    try {
      const configPath = `${this.app.vault.configDir}/plugins/obsidian-full-calendar/data.json`;

      if (await this.app.vault.adapter.exists(configPath)) {
        const configText = await this.app.vault.adapter.read(configPath);
        const config: FullCalendarConfig = JSON.parse(configText);

        const icalSources = config.calendarSources?.filter(
          (s) => s.type === 'ical' && s.url
        );

        if (icalSources && icalSources.length > 0) {
          this.settings.calendarSources = icalSources.map((s, i) => ({
            url: s.url!,
            name: `Calendar ${i + 1}`,
            enabled: true,
          }));
          await this.saveSettings();
          new Notice(`Imported ${icalSources.length} calendar(s) from Full Calendar plugin`);
        }
      }
    } catch (error) {
      console.warn('Could not import from full-calendar:', error);
    }
  }

  /**
   * Main refresh function - fetch calendar and recalculate
   */
  async refreshFreeTime(): Promise<void> {
    if (this.settings.calendarSources.length === 0) {
      this.statusBar?.showError('No calendars configured');
      return;
    }

    this.statusBar?.showLoading();

    try {
      // Calculate date range
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + this.settings.lookaheadDays);

      // Fetch events from all calendars
      const events = await this.icalParser.fetchAllEvents(
        this.settings.calendarSources,
        now,
        endDate
      );

      // Calculate free time
      const result = this.timeCalculator.calculateFreeTime(events);

      // Update status bar
      this.statusBar?.update(result);

      // Cache result
      this.settings.cachedFreeTimeHours = result.freeHours;
      this.settings.lastFetchTimestamp = Date.now();
      await this.saveSettings();

      // Show warnings if needed
      this.handleWarnings(result);
    } catch (error) {
      console.error('Failed to refresh free time:', error);
      this.statusBar?.showError(String(error));
      new Notice(`Free Time Tracker: ${error}`);
    }
  }

  /**
   * Handle warning display logic
   */
  private handleWarnings(result: FreeTimeResult): void {
    // Check if we already showed warning today
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastWarningDismissDate === today) {
      return;
    }

    if (result.warningLevel === 'critical') {
      // Show modal for critical warnings
      if (this.settings.showWarningModal) {
        new FreeTimeWarningModal(this.app, result, () => {
          this.lastWarningDismissDate = today;
        }).open();
      }
      // Also show notice
      if (this.settings.showWarningNotice) {
        new Notice(
          `Critical: Only ${result.freeHours.toFixed(1)} hours of free time this week!`,
          10000
        );
      }
    } else if (result.warningLevel === 'warning') {
      // Just show notice for warnings
      if (this.settings.showWarningNotice) {
        new Notice(
          `Low free time: ${result.freeHours.toFixed(1)} hours remaining`,
          5000
        );
      }
    }
  }

  /**
   * Show detailed modal with free time breakdown
   */
  private async showDetailsModal(): Promise<void> {
    if (this.settings.calendarSources.length === 0) {
      new Notice('No calendars configured');
      return;
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + this.settings.lookaheadDays);

    try {
      const events = await this.icalParser.fetchAllEvents(
        this.settings.calendarSources,
        now,
        endDate
      );
      const result = this.timeCalculator.calculateFreeTime(events);
      new FreeTimeWarningModal(this.app, result).open();
    } catch (error) {
      new Notice(`Error: ${error}`);
    }
  }

  /**
   * Start the automatic refresh interval
   */
  startRefreshInterval(): void {
    this.stopRefreshInterval();

    const intervalMs = this.settings.refreshIntervalMinutes * 60 * 1000;
    this.refreshIntervalId = window.setInterval(
      () => this.refreshFreeTime(),
      intervalMs
    );

    // Register with Obsidian for cleanup
    this.registerInterval(this.refreshIntervalId);
  }

  /**
   * Stop the automatic refresh interval
   */
  stopRefreshInterval(): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  /**
   * Restart refresh interval (called when settings change)
   */
  restartRefreshInterval(): void {
    this.startRefreshInterval();
  }

  /**
   * Update status bar visibility
   */
  updateStatusBarVisibility(): void {
    if (this.settings.showStatusBar) {
      if (!this.statusBar) {
        this.statusBarEl = this.addStatusBarItem();
        this.statusBar = new FreeTimeStatusBar(this.statusBarEl, () => this.showDetailsModal());
        this.refreshFreeTime();
      }
      this.statusBar.setVisible(true);
    } else {
      this.statusBar?.setVisible(false);
    }
  }
}
