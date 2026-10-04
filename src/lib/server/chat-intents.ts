export function workflowIntent(message: string) {
  if (/\b(?:status|overview|dashboard|how (?:am i|are we)|what.?s (?:pending|due)|what (?:is|do) .*today|my day|today.?s (?:plan|schedule)|daily (?:summary|update))\b/i.test(message)) return "overview";
  if (/\b(?:add|invite|include|bring|remove|delete|revoke|unshare|take off)\b/i.test(message) && /\b(?:member|family|relative|person|access|brother|sister|parent|mother|father|spouse|wife|husband|child|daughter|son|circle)\b/i.test(message)) return /\b(?:remove|delete|revoke|unshare|take off)\b/i.test(message) ? "remove_member" : "add_member";
  if (/\b(?:upload|attach|import|save|add|store|submit|send)\b/i.test(message) && /\b(?:documents?|files?|reports?|records?|prescriptions?|pdf|scan)\b/i.test(message)) return "upload";
  if (/\b(?:view|browse|look at|see|check|show|open|manage|find|access|go to|review)\b/i.test(message) && /\b(?:documents?|files?|records?|reports?|prescriptions?|library|repository)\b/i.test(message)) return "documents";
  return null;
}
