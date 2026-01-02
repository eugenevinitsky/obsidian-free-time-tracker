import { App, Modal, Setting } from 'obsidian';
import { FreeTimeResult } from './types';

export class FreeTimeWarningModal extends Modal {
  private result: FreeTimeResult;
  private onDismissForToday: () => void;

  constructor(app: App, result: FreeTimeResult, onDismissForToday?: () => void) {
    super(app);
    this.result = result;
    this.onDismissForToday = onDismissForToday || (() => {});
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('free-time-warning-modal');

    const isCritical = this.result.warningLevel === 'critical';

    // Header
    const headerText = isCritical
      ? 'Critical: Low Free Time!'
      : 'Warning: Free Time Running Low';
    contentEl.createEl('h2', {
      text: headerText,
      cls: isCritical ? 'warning-critical' : 'warning-normal',
    });

    // Main message
    contentEl.createEl('p', {
      text: `You only have ${this.result.freeHours.toFixed(1)} hours of free time in the next ${this.getDayCount()} days.`,
    });

    // Stats breakdown
    const statsEl = contentEl.createDiv({ cls: 'free-time-stats' });

    this.addStatRow(statsEl, 'Free Time', `${this.result.freeHours.toFixed(1)} hours`);
    this.addStatRow(statsEl, 'Scheduled', `${this.result.scheduledHours.toFixed(1)} hours`);
    this.addStatRow(
      statsEl,
      'Utilization',
      `${(100 - this.result.percentageFree).toFixed(0)}%`
    );

    // Period info
    contentEl.createEl('p', {
      text: `Period: ${this.formatDateRange(this.result.periodStart, this.result.periodEnd)}`,
      cls: 'period-info',
    });

    // Suggestions for critical
    if (isCritical) {
      const suggestionsEl = contentEl.createDiv({ cls: 'suggestions' });
      suggestionsEl.createEl('h4', { text: 'Consider:' });
      const list = suggestionsEl.createEl('ul');
      list.createEl('li', { text: 'Rescheduling non-essential meetings' });
      list.createEl('li', { text: 'Blocking time for focused work' });
      list.createEl('li', { text: 'Declining new meeting requests' });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const dismissBtn = buttonContainer.createEl('button', { text: 'Dismiss' });
    dismissBtn.addEventListener('click', () => this.close());

    const dismissTodayBtn = buttonContainer.createEl('button', {
      text: "Don't show again today",
      cls: 'mod-cta',
    });
    dismissTodayBtn.addEventListener('click', () => {
      this.onDismissForToday();
      this.close();
    });
  }

  private addStatRow(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv({ cls: 'stat-row' });
    row.createSpan({ text: label, cls: 'stat-label' });
    row.createSpan({ text: value, cls: 'stat-value' });
  }

  private getDayCount(): number {
    const diff = this.result.periodEnd.getTime() - this.result.periodStart.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  private formatDateRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
