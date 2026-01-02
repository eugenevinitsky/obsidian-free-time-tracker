import { setIcon } from 'obsidian';
import { FreeTimeResult } from './types';

export class FreeTimeStatusBar {
  private statusBarEl: HTMLElement;
  private iconEl: HTMLElement;
  private textEl: HTMLElement;

  constructor(statusBarEl: HTMLElement, onClick?: () => void) {
    this.statusBarEl = statusBarEl;
    this.statusBarEl.addClass('free-time-tracker-status');

    // Add click handler
    if (onClick) {
      this.statusBarEl.addEventListener('click', onClick);
    }

    // Create icon and text containers
    this.iconEl = this.statusBarEl.createSpan({ cls: 'status-bar-icon' });
    this.textEl = this.statusBarEl.createSpan({ cls: 'status-bar-text' });

    // Initial state
    this.showLoading();
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    setIcon(this.iconEl, 'clock');
    this.textEl.setText('...');
    this.statusBarEl.setAttribute('aria-label', 'Free Time Tracker: Loading...');
    this.setWarningClass('none');
  }

  /**
   * Show error state
   */
  showError(message: string): void {
    setIcon(this.iconEl, 'alert-triangle');
    this.textEl.setText('Error');
    this.statusBarEl.setAttribute('aria-label', `Free Time Tracker Error: ${message}`);
    this.setWarningClass('critical');
  }

  /**
   * Update display with calculated result
   */
  update(result: FreeTimeResult): void {
    const freeHoursRounded = Math.round(result.freeHours * 10) / 10;

    // Update icon based on warning level
    switch (result.warningLevel) {
      case 'critical':
        setIcon(this.iconEl, 'alert-circle');
        break;
      case 'warning':
        setIcon(this.iconEl, 'alert-triangle');
        break;
      default:
        setIcon(this.iconEl, 'clock');
    }

    // Update text
    this.textEl.setText(`${freeHoursRounded}h free`);

    // Update tooltip
    const tooltip = this.buildTooltip(result);
    this.statusBarEl.setAttribute('aria-label', tooltip);

    // Update warning class for styling
    this.setWarningClass(result.warningLevel);
  }

  /**
   * Build detailed tooltip
   */
  private buildTooltip(result: FreeTimeResult): string {
    const lines = [
      'Free Time Tracker',
      '---',
      `Free: ${result.freeHours.toFixed(1)} hours`,
      `Scheduled: ${result.scheduledHours.toFixed(1)} hours`,
      `Total trackable: ${result.totalTrackableHours.toFixed(1)} hours`,
      '---',
      `Period: ${this.formatDate(result.periodStart)} - ${this.formatDate(result.periodEnd)}`,
    ];

    if (result.warningLevel === 'critical') {
      lines.unshift('CRITICAL: Very little free time!');
    } else if (result.warningLevel === 'warning') {
      lines.unshift('WARNING: Free time is low');
    }

    return lines.join('\n');
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Set warning class for CSS styling
   */
  private setWarningClass(level: 'none' | 'warning' | 'critical'): void {
    this.statusBarEl.removeClass(
      'free-time-warning',
      'free-time-critical',
      'free-time-ok'
    );

    switch (level) {
      case 'critical':
        this.statusBarEl.addClass('free-time-critical');
        break;
      case 'warning':
        this.statusBarEl.addClass('free-time-warning');
        break;
      default:
        this.statusBarEl.addClass('free-time-ok');
    }
  }

  /**
   * Show/hide the status bar element
   */
  setVisible(visible: boolean): void {
    this.statusBarEl.style.display = visible ? 'flex' : 'none';
  }
}
