import { DayAvailability, TimeSlot } from '../types/services.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('availability');

/**
 * Availability state management
 * Manages table reservations and time slot availability
 */
class AvailabilityState {
  private availability: Map<string, DayAvailability> = new Map();
  private reservations: Map<string, any[]> = new Map(); // date -> reservations
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadInitialAvailability();
    
    // Update availability every hour
    this.updateInterval = setInterval(() => {
      this.refreshAvailability();
    }, 60 * 60 * 1000);
  }

  /**
   * Load initial availability data
   */
  private loadInitialAvailability() {
    try {
      // Generate availability for next 30 days
      const today = new Date();
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        this.availability.set(dateStr, this.generateDayAvailability(date));
      }
      
      logger.info({ days: this.availability.size }, 'Availability loaded');
    } catch (error) {
      logger.error({ error }, 'Failed to load initial availability');
    }
  }

  /**
   * Generate availability for a specific day
   */
  private generateDayAvailability(date: Date): DayAvailability {
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    
    // Closed on Mondays
    if (dayOfWeek === 1) {
      return {
        date: dateStr,
        slots: [],
        isOpen: false,
        specialNotes: 'Closed on Mondays',
      };
    }
    
    const slots: TimeSlot[] = [];
    
    // Lunch slots (11:30 AM - 2:30 PM)
    const lunchTimes = ['11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30'];
    lunchTimes.forEach(time => {
      slots.push({
        time,
        available: true,
        maxPartySize: 6,
        remainingSlots: Math.floor(Math.random() * 3) + 1, // 1-3 slots
      });
    });
    
    // Dinner slots (5:00 PM - 9:30 PM)
    const dinnerTimes = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];
    dinnerTimes.forEach(time => {
      slots.push({
        time,
        available: true,
        maxPartySize: 8,
        remainingSlots: Math.floor(Math.random() * 4) + 1, // 1-4 slots
      });
    });
    
    // Randomly make some slots unavailable (simulate bookings)
    const unavailableCount = Math.floor(slots.length * 0.3); // 30% unavailable
    const unavailableIndices = new Set<number>();
    
    while (unavailableIndices.size < unavailableCount) {
      unavailableIndices.add(Math.floor(Math.random() * slots.length));
    }
    
    unavailableIndices.forEach(index => {
      slots[index].available = false;
      slots[index].remainingSlots = 0;
    });
    
    return {
      date: dateStr,
      slots,
      isOpen: true,
    };
  }

  /**
   * Get availability for a specific date
   */
  getAvailability(date: string): DayAvailability | undefined {
    return this.availability.get(date);
  }

  /**
   * Get available time slots for a date and party size
   */
  getAvailableSlots(date: string, partySize: number): TimeSlot[] {
    const dayAvailability = this.availability.get(date);
    
    if (!dayAvailability || !dayAvailability.isOpen) {
      return [];
    }
    
    return dayAvailability.slots.filter(slot => 
      slot.available && 
      slot.remainingSlots > 0 && 
      slot.maxPartySize >= partySize
    );
  }

  /**
   * Check if a specific time slot is available
   */
  isTimeSlotAvailable(date: string, time: string, partySize: number): boolean {
    const slots = this.getAvailableSlots(date, partySize);
    return slots.some(slot => slot.time === time);
  }

  /**
   * Reserve a time slot
   */
  reserveSlot(date: string, time: string, partySize: number, reservationData: any): boolean {
    const dayAvailability = this.availability.get(date);
    
    if (!dayAvailability) {
      return false;
    }
    
    const slotIndex = dayAvailability.slots.findIndex(slot => 
      slot.time === time && 
      slot.available && 
      slot.remainingSlots > 0 && 
      slot.maxPartySize >= partySize
    );
    
    if (slotIndex === -1) {
      return false;
    }
    
    // Update slot availability
    const updatedSlots = [...dayAvailability.slots];
    updatedSlots[slotIndex] = {
      ...updatedSlots[slotIndex],
      remainingSlots: updatedSlots[slotIndex].remainingSlots - 1,
    };
    
    // Mark as unavailable if no slots remaining
    if (updatedSlots[slotIndex].remainingSlots === 0) {
      updatedSlots[slotIndex].available = false;
    }
    
    // Update availability
    this.availability.set(date, {
      ...dayAvailability,
      slots: updatedSlots,
    });
    
    // Track reservation
    const dateReservations = this.reservations.get(date) || [];
    dateReservations.push({
      time,
      partySize,
      ...reservationData,
      reservedAt: new Date().toISOString(),
    });
    this.reservations.set(date, dateReservations);
    
    logger.info({ date, time, partySize }, 'Time slot reserved');
    return true;
  }

  /**
   * Get next available time slots
   */
  getNextAvailableSlots(partySize: number, maxDays = 7): Array<{ date: string; time: string }> {
    const results: Array<{ date: string; time: string }> = [];
    const today = new Date();
    
    for (let i = 0; i < maxDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const availableSlots = this.getAvailableSlots(dateStr, partySize);
      
      availableSlots.forEach(slot => {
        results.push({ date: dateStr, time: slot.time });
      });
      
      // Limit results
      if (results.length >= 10) {
        break;
      }
    }
    
    return results.slice(0, 10);
  }

  /**
   * Format availability for voice response
   */
  formatAvailabilityForVoice(date: string, partySize: number): string {
    const dayAvailability = this.availability.get(date);
    
    if (!dayAvailability) {
      return "I don't have availability information for that date.";
    }
    
    if (!dayAvailability.isOpen) {
      const reason = dayAvailability.specialNotes || 'We are closed';
      return `${reason} on that date.`;
    }
    
    const availableSlots = this.getAvailableSlots(date, partySize);
    
    if (availableSlots.length === 0) {
      // Suggest alternative dates
      const alternatives = this.getNextAvailableSlots(partySize, 3);
      if (alternatives.length > 0) {
        const altDate = alternatives[0].date;
        const altTime = this.formatTimeForVoice(alternatives[0].time);
        return `Unfortunately, we don't have availability for ${partySize} people on that date. However, I can offer you ${altTime} on ${this.formatDateForVoice(altDate)}. Would that work?`;
      }
      return `Unfortunately, we don't have availability for ${partySize} people on that date.`;
    }
    
    // Group by lunch/dinner
    const lunchSlots = availableSlots.filter(slot => {
      const hour = parseInt(slot.time.split(':')[0]);
      return hour < 15; // Before 3 PM
    });
    
    const dinnerSlots = availableSlots.filter(slot => {
      const hour = parseInt(slot.time.split(':')[0]);
      return hour >= 15; // 3 PM or later
    });
    
    let response = `For ${partySize} people on ${this.formatDateForVoice(date)}, `;
    
    if (lunchSlots.length > 0 && dinnerSlots.length > 0) {
      response += `I have both lunch and dinner availability. `;
      response += `For lunch: ${this.formatTimesForVoice(lunchSlots.slice(0, 3))}. `;
      response += `For dinner: ${this.formatTimesForVoice(dinnerSlots.slice(0, 3))}.`;
    } else if (lunchSlots.length > 0) {
      response += `I have lunch availability at: ${this.formatTimesForVoice(lunchSlots.slice(0, 5))}.`;
    } else if (dinnerSlots.length > 0) {
      response += `I have dinner availability at: ${this.formatTimesForVoice(dinnerSlots.slice(0, 5))}.`;
    }
    
    return response;
  }

  /**
   * Format time for voice (24-hour to 12-hour)
   */
  private formatTimeForVoice(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
    
    return `${displayHours}${displayMinutes} ${period}`;
  }

  /**
   * Format multiple times for voice
   */
  private formatTimesForVoice(slots: TimeSlot[]): string {
    const times = slots.map(slot => this.formatTimeForVoice(slot.time));
    
    if (times.length === 1) {
      return times[0];
    }
    
    if (times.length === 2) {
      return `${times[0]} and ${times[1]}`;
    }
    
    return `${times.slice(0, -1).join(', ')}, and ${times[times.length - 1]}`;
  }

  /**
   * Format date for voice
   */
  private formatDateForVoice(date: string): string {
    const dateObj = new Date(date + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (date === todayStr) {
      return 'today';
    } else if (date === tomorrowStr) {
      return 'tomorrow';
    } else {
      return dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }

  /**
   * Refresh availability (placeholder for real-time updates)
   */
  private refreshAvailability() {
    // TODO: Implement real-time availability refresh
    logger.debug('Availability refresh - using cached data');
  }

  /**
   * Get availability statistics
   */
  getStats() {
    const totalDays = this.availability.size;
    const openDays = Array.from(this.availability.values()).filter(day => day.isOpen).length;
    const totalSlots = Array.from(this.availability.values())
      .reduce((sum, day) => sum + day.slots.length, 0);
    const availableSlots = Array.from(this.availability.values())
      .reduce((sum, day) => sum + day.slots.filter(slot => slot.available).length, 0);
    
    return {
      totalDays,
      openDays,
      totalSlots,
      availableSlots,
      occupancyRate: totalSlots > 0 ? (totalSlots - availableSlots) / totalSlots : 0,
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    logger.info('Availability state shutdown');
  }
}

// Singleton instance
export const availabilityState = new AvailabilityState();

export { AvailabilityState };
