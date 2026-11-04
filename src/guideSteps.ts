import { BUSY_HEADER, SHORTCUT_NAME } from './shortcutBridge';

export interface GuideSection {
  title: string;
  note?: string;
  steps: string[];
}

/** One-time setup of the "Paced Sync" shortcut. Kept in sync with README.md. */
export const GUIDE: GuideSection[] = [
  {
    title: 'Before you start',
    steps: [
      'Open the Calendar app → Calendars → Add Calendar → name it exactly "Paced" (put it in iCloud). Your work blocks and deadlines will live there.',
      `Open the Shortcuts app → tap + → tap the name at the top → Rename → "${SHORTCUT_NAME}" (exact spelling and capitals).`,
      'To add each action below, tap the search bar at the bottom, type the action name and tap it. To insert a variable (like Shortcut Input or Repeat Item), tap the field and pick it from the bar above the keyboard.',
    ],
  },
  {
    title: 'Part 1: write the plan into your calendar',
    note: 'These actions run only when Paced sends a plan.',
    steps: [
      'Add "If". Tap its first field → Shortcut Input. Set the condition to "has any value". If a line "Receive … input from Nowhere" appears at the top, tap Nowhere → turn on Share Sheet.',
      'Inside the If (before "Otherwise"), add "Find Calendar Events". Add filter: Calendar is Paced. Add filter: End Date is in the next 60 days.',
      'Add "Remove Events" (it uses the Calendar Events found above).',
      'Add "Get Dictionary from Input" and set its input to Shortcut Input.',
      'Add "Get Dictionary Value": Get Value for key events in Dictionary.',
      'Add "Repeat with Each" and set it to the Dictionary Value from the step above.',
      'Inside the Repeat: add "Get Dictionary Value": Value for key t in Repeat Item. Then add "Set Variable" and name it EvTitle.',
      'Still inside: "Get Dictionary Value" for key s in Repeat Item, then "Set Variable" EvStart.',
      'Still inside: "Get Dictionary Value" for key e in Repeat Item, then "Set Variable" EvEnd.',
      'Still inside: add "Add New Event". Title: EvTitle. Start Date: EvStart. End Date: EvEnd. Calendar: Paced. Tap Show More → Alert: 5 minutes before (or whatever you like).',
      'Leave the "Otherwise" part empty.',
    ],
  },
  {
    title: 'Part 2: read your events back',
    note: 'These go at the very bottom, after "End If".',
    steps: [
      'Add "Find Calendar Events". Filters: Start Date is in the next 28 days · Calendar is not Paced · Is All Day is false. Sort by Start Date, Oldest First. Leave Limit off.',
      'Add "Repeat with Each" for those Calendar Events.',
      'Inside, add "Text". Insert Repeat Item, tap it → Start Date → Date Format: ISO 8601, turn on Include ISO 8601 Time. Type |  then insert Repeat Item → End Date (same ISO 8601 format). Type |  then insert Repeat Item → Title.',
      'After "End Repeat", add "Combine Text": combine Repeat Results with New Lines.',
      `Add another "Text": type ${BUSY_HEADER}, press return, then insert Combined Text.`,
      'Add "Copy to Clipboard" (it copies that Text).',
      'Add "Show Notification": "Calendar synced. Go back to Paced and tap Paste calendar."',
    ],
  },
  {
    title: 'Try it',
    steps: [
      'Tap ▶ in the shortcut editor once. Allow calendar access when asked. It copies your events.',
      'Come back here and tap Paste calendar. Your events now show on Today, and work is planned around them.',
      'From now on, just tap Sync with Calendar. iPhone asks to open Shortcuts: tap Open. The shortcut runs, then you come back and tap Paste calendar.',
      'If Shortcuts asks before removing events, choose Always Allow so it stops asking.',
    ],
  },
];
