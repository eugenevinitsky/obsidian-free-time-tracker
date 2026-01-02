import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type FreeTimeTrackerPlugin from '../main';
import { FreeTimeTrackerSettings, CalendarSource } from './types';

export const DEFAULT_SETTINGS: FreeTimeTrackerSettings = {
  calendarSources: [],
  useFullCalendarConfig: true,

  trackingStartHour: 9,
  trackingEndHour: 20,
  includeWeekends: true,

  excludedKeywords: [],

  warningThresholdHours: 15,
  criticalThresholdHours: 5,

  showStatusBar: true,
  showWarningModal: true,
  showWarningNotice: true,

  refreshIntervalMinutes: 30,
  lookaheadDays: 7,

  lastFetchTimestamp: 0,
  cachedFreeTimeHours: null,
};

export class FreeTimeTrackerSettingTab extends PluginSettingTab {
  plugin: FreeTimeTrackerPlugin;

  constructor(app: App, plugin: FreeTimeTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Free Time Tracker Settings' });

    // Calendar Source Section
    containerEl.createEl('h3', { text: 'Calendar Sources' });

    new Setting(containerEl)
      .setName('Use Full Calendar plugin configuration')
      .setDesc('Automatically import iCal URLs from obsidian-full-calendar plugin')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFullCalendarConfig)
          .onChange(async (value) => {
            this.plugin.settings.useFullCalendarConfig = value;
            await this.plugin.saveSettings();
            if (value) {
              await this.plugin.importFromFullCalendar();
            }
            this.display();
          })
      );

    // Show current calendar sources with editable fields
    for (let i = 0; i < this.plugin.settings.calendarSources.length; i++) {
      const source = this.plugin.settings.calendarSources[i];
      const sourceContainer = containerEl.createDiv({ cls: 'calendar-source-container' });

      // Header with name, toggle, and delete
      new Setting(sourceContainer)
        .setName(`Calendar ${i + 1}`)
        .addToggle((toggle) =>
          toggle
            .setValue(source.enabled)
            .setTooltip('Enable/disable this calendar')
            .onChange(async (value) => {
              this.plugin.settings.calendarSources[i].enabled = value;
              await this.plugin.saveSettings();
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon('trash')
            .setTooltip('Remove calendar')
            .onClick(async () => {
              this.plugin.settings.calendarSources.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );

      // Name input
      new Setting(sourceContainer)
        .setName('Name')
        .addText((text) =>
          text
            .setPlaceholder('My Calendar')
            .setValue(source.name)
            .onChange(async (value) => {
              this.plugin.settings.calendarSources[i].name = value;
              await this.plugin.saveSettings();
            })
        );

      // URL input
      new Setting(sourceContainer)
        .setName('iCal URL')
        .addText((text) =>
          text
            .setPlaceholder('https://calendar.google.com/calendar/ical/...')
            .setValue(source.url)
            .onChange(async (value) => {
              this.plugin.settings.calendarSources[i].url = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // Add new calendar source button
    new Setting(containerEl)
      .setName('Add calendar')
      .addButton((btn) =>
        btn
          .setButtonText('+ Add Calendar')
          .onClick(() => {
            this.plugin.settings.calendarSources.push({
              url: '',
              name: '',
              enabled: true,
            });
            this.plugin.saveSettings();
            this.display();
          })
      );

    // Tracking Window Section
    containerEl.createEl('h3', { text: 'Tracking Window' });

    new Setting(containerEl)
      .setName('Start hour')
      .setDesc('When your trackable day starts (e.g., 9 for 9am)')
      .addText((text) =>
        text
          .setPlaceholder('9')
          .setValue(String(this.plugin.settings.trackingStartHour))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0 && num <= 23) {
              this.plugin.settings.trackingStartHour = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('End hour')
      .setDesc('When your trackable day ends (e.g., 20 for 8pm)')
      .addText((text) =>
        text
          .setPlaceholder('20')
          .setValue(String(this.plugin.settings.trackingEndHour))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0 && num <= 23) {
              this.plugin.settings.trackingEndHour = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Include weekends')
      .setDesc('Count Saturday and Sunday in free time calculation')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeWeekends)
          .onChange(async (value) => {
            this.plugin.settings.includeWeekends = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Lookahead period (days)')
      .setDesc('How many days ahead to calculate free time')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('7', 'This week (7 days)')
          .addOption('14', 'Two weeks')
          .addOption('1', 'Today only')
          .addOption('3', 'Next 3 days')
          .setValue(String(this.plugin.settings.lookaheadDays))
          .onChange(async (value) => {
            this.plugin.settings.lookaheadDays = Number(value);
            await this.plugin.saveSettings();
          })
      );

    // Event Filtering Section
    containerEl.createEl('h3', { text: 'Event Filtering' });

    new Setting(containerEl)
      .setName('Excluded keywords')
      .setDesc('Events containing these words will be ignored (comma-separated)')
      .addTextArea((text) =>
        text
          .setPlaceholder('OOO, blocked, tentative')
          .setValue(this.plugin.settings.excludedKeywords.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.excludedKeywords = value
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // Warning Thresholds Section
    containerEl.createEl('h3', { text: 'Warning Thresholds' });

    new Setting(containerEl)
      .setName('Warning threshold (hours)')
      .setDesc('Show warning when free time falls below this value')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.warningThresholdHours))
          .onChange(async (value) => {
            const num = Number(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.warningThresholdHours = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Critical threshold (hours)')
      .setDesc('Show critical warning when free time falls below this value')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.criticalThresholdHours))
          .onChange(async (value) => {
            const num = Number(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.criticalThresholdHours = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Display Options Section
    containerEl.createEl('h3', { text: 'Display Options' });

    new Setting(containerEl)
      .setName('Show status bar')
      .setDesc('Display free time in the Obsidian status bar')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showStatusBar = value;
            await this.plugin.saveSettings();
            this.plugin.updateStatusBarVisibility();
          })
      );

    new Setting(containerEl)
      .setName('Show warning modal')
      .setDesc('Display a modal dialog when free time is critically low')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWarningModal)
          .onChange(async (value) => {
            this.plugin.settings.showWarningModal = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show warning notice')
      .setDesc('Display a notice when free time falls below threshold')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWarningNotice)
          .onChange(async (value) => {
            this.plugin.settings.showWarningNotice = value;
            await this.plugin.saveSettings();
          })
      );

    // Sync Section
    containerEl.createEl('h3', { text: 'Sync & Refresh' });

    new Setting(containerEl)
      .setName('Refresh interval (minutes)')
      .setDesc('How often to fetch and recalculate free time')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('15', 'Every 15 minutes')
          .addOption('30', 'Every 30 minutes')
          .addOption('60', 'Every hour')
          .addOption('120', 'Every 2 hours')
          .setValue(String(this.plugin.settings.refreshIntervalMinutes))
          .onChange(async (value) => {
            this.plugin.settings.refreshIntervalMinutes = Number(value);
            await this.plugin.saveSettings();
            this.plugin.restartRefreshInterval();
          })
      );

    new Setting(containerEl)
      .setName('Refresh now')
      .setDesc('Manually fetch calendar and recalculate')
      .addButton((btn) =>
        btn
          .setButtonText('Refresh')
          .onClick(async () => {
            new Notice('Refreshing calendar data...');
            await this.plugin.refreshFreeTime();
            new Notice('Free time updated!');
          })
      );
  }
}
