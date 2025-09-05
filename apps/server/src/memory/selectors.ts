import { ExtendedSession, Intent, TranscriptEntry } from '../types/session.js';

/**
 * Selector functions for extracting data from sessions
 */

/**
 * Get the last transcript entry from caller
 */
export function getLastCallerMessage(session: ExtendedSession): TranscriptEntry | undefined {
  return session.transcript
    .filter(entry => entry.who === 'caller')
    .slice(-1)[0];
}

/**
 * Get the last transcript entry from agent
 */
export function getLastAgentMessage(session: ExtendedSession): TranscriptEntry | undefined {
  return session.transcript
    .filter(entry => entry.who === 'agent')
    .slice(-1)[0];
}

/**
 * Get all caller messages
 */
export function getCallerMessages(session: ExtendedSession): TranscriptEntry[] {
  return session.transcript.filter(entry => entry.who === 'caller');
}

/**
 * Get all agent messages
 */
export function getAgentMessages(session: ExtendedSession): TranscriptEntry[] {
  return session.transcript.filter(entry => entry.who === 'agent');
}

/**
 * Check if required data is collected for an intent
 */
export function hasRequiredData(session: ExtendedSession, intent: Intent): boolean {
  const { collected } = session;

  switch (intent) {
    case 'lead':
      return !!(collected.name && collected.email);
    
    case 'booking':
      return !!(collected.name && collected.partySize && collected.dateTime);
    
    case 'menu':
      return true; // No required data for menu intent
    
    default:
      return false;
  }
}

/**
 * Get missing required fields for an intent
 */
export function getMissingFields(session: ExtendedSession, intent: Intent): string[] {
  const { collected } = session;
  const missing: string[] = [];

  switch (intent) {
    case 'lead':
      if (!collected.name) missing.push('name');
      if (!collected.email) missing.push('email');
      break;
    
    case 'booking':
      if (!collected.name) missing.push('name');
      if (!collected.partySize) missing.push('party size');
      if (!collected.dateTime) missing.push('date and time');
      break;
    
    case 'menu':
      // No required fields
      break;
  }

  return missing;
}

/**
 * Get conversation context for LLM
 */
export function getConversationContext(session: ExtendedSession, maxEntries = 10): string {
  const recentTranscript = session.transcript.slice(-maxEntries);
  
  return recentTranscript
    .map(entry => `${entry.who === 'caller' ? 'Customer' : 'Agent'}: ${entry.text}`)
    .join('\n');
}

/**
 * Check if session has been idle for too long
 */
export function isSessionIdle(session: ExtendedSession, idleThresholdMs = 5 * 60 * 1000): boolean {
  return Date.now() - session.lastActivity > idleThresholdMs;
}

/**
 * Get session duration in milliseconds
 */
export function getSessionDuration(session: ExtendedSession): number {
  const endTime = session.isActive ? Date.now() : session.lastActivity;
  return endTime - session.createdAt;
}

/**
 * Check if caller has mentioned specific keywords
 */
export function hasKeywords(session: ExtendedSession, keywords: string[]): boolean {
  const callerText = getCallerMessages(session)
    .map(entry => entry.text.toLowerCase())
    .join(' ');

  return keywords.some(keyword => 
    callerText.includes(keyword.toLowerCase())
  );
}

/**
 * Get successful CRM actions
 */
export function getSuccessfulCRMActions(session: ExtendedSession) {
  return session.crmActions.filter(action => action.status === 'success');
}

/**
 * Get failed CRM actions
 */
export function getFailedCRMActions(session: ExtendedSession) {
  return session.crmActions.filter(action => action.status === 'failed');
}

/**
 * Check if specific CRM action was successful
 */
export function wasCRMActionSuccessful(session: ExtendedSession, actionType: string): boolean {
  return session.crmActions.some(
    action => action.type === actionType && action.status === 'success'
  );
}

/**
 * Get formatted summary of collected data
 */
export function getCollectedDataSummary(session: ExtendedSession): string {
  const { collected } = session;
  const parts: string[] = [];

  if (collected.name) parts.push(`Name: ${collected.name}`);
  if (collected.email) parts.push(`Email: ${collected.email}`);
  if (collected.phone) parts.push(`Phone: ${collected.phone}`);
  if (collected.partySize) parts.push(`Party Size: ${collected.partySize}`);
  if (collected.dateTime) parts.push(`Date/Time: ${collected.dateTime}`);
  if (collected.useCase) parts.push(`Use Case: ${collected.useCase}`);
  if (collected.specialRequests) parts.push(`Special Requests: ${collected.specialRequests}`);

  return parts.length > 0 ? parts.join(', ') : 'No data collected';
}

/**
 * Check if this is the first interaction
 */
export function isFirstInteraction(session: ExtendedSession): boolean {
  return session.transcript.length === 0;
}

/**
 * Get intent confidence based on conversation
 */
export function getIntentConfidence(session: ExtendedSession): Record<Intent, number> {
  const callerText = getCallerMessages(session)
    .map(entry => entry.text.toLowerCase())
    .join(' ');

  // Simple keyword-based confidence scoring
  const leadKeywords = ['information', 'details', 'learn', 'tell me', 'contact', 'email'];
  const bookingKeywords = ['reservation', 'table', 'book', 'reserve', 'dinner', 'lunch', 'party'];
  const menuKeywords = ['menu', 'food', 'eat', 'dish', 'special', 'what do you have'];

  const leadScore = leadKeywords.filter(kw => callerText.includes(kw)).length / leadKeywords.length;
  const bookingScore = bookingKeywords.filter(kw => callerText.includes(kw)).length / bookingKeywords.length;
  const menuScore = menuKeywords.filter(kw => callerText.includes(kw)).length / menuKeywords.length;

  return {
    lead: Math.min(leadScore, 1),
    booking: Math.min(bookingScore, 1),
    menu: Math.min(menuScore, 1),
  };
}
