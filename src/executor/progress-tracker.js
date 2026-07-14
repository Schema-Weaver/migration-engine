export class ProgressTracker {
  constructor() {
    this.progress = new Map();
    this.listeners = new Set();
    this.events = [];
  }

  /**
   * @param {string} stepId
   * @param {'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'} status
   * @param {string} [message]
   */
  update(stepId, status, message) {
    this.progress.set(stepId, { status, message, timestamp: Date.now() });
    for (const listener of this.listeners) {
      listener({ stepId, status, message, timestamp: Date.now() });
    }
  }

  /**
   * Emit a progress event
   * @param {Object} event
   */
  emit(event) {
    this.events.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        // Don't let listener errors break execution
      }
    }
  }

  /**
   * Subscribe to progress events
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get progress for a step
   * @param {string} stepId
   * @returns {Object}
   */
  get(stepId) {
    return this.progress.get(stepId) || { status: 'PENDING' };
  }

  /**
   * Get all progress
   * @returns {Object}
   */
  getAll() {
    return Object.fromEntries(this.progress);
  }

  /**
   * Get all events
   * @returns {Array}
   */
  getEvents() {
    return this.events;
  }

  /**
   * Clear all progress and events
   */
  clear() {
    this.progress.clear();
    this.events = [];
  }
}
