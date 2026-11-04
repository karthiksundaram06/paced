import { BUSY_HEADER, PACED_URL, RETURN_PREFIX, SHORTCUT_NAME } from './shortcutBridge';

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
    title: 'Part 2: read your events and open Paced',
    note: 'These go at the very bottom, after "End If". (Built an older version with Copy to Clipboard? Delete Copy to Clipboard and Show Notification, then do the last two steps here.)',
    steps: [
      'Add "Find Calendar Events". Filters: Start Date is in the next 28 days · Calendar is not Paced · Is All Day is false. Sort by Start Date, Oldest First. Leave Limit off.',
      'Add "Repeat with Each" for those Calendar Events.',
      'Inside, add "Text". Insert Repeat Item, tap it → Start Date → Date Format: ISO 8601, turn on Include ISO 8601 Time. Type |  then insert Repeat Item → End Date (same ISO 8601 format). Type |  then insert Repeat Item → Title.',
      'After "End Repeat", add "Combine Text": combine Repeat Results with New Lines.',
      `Add another "Text": type ${BUSY_HEADER}, press return, then insert Combined Text.`,
      'Add "URL Encode" (it encodes that Text).',
      `Add "URL" (the plain one, blue link icon). Replace its address with ${RETURN_PREFIX}  and straight after "result=" insert URL Encoded Text. Nothing after it.`,
      'Add "Open URLs". It should say "Open URL". (If you get "sharing … Calendar items is not allowed": Settings app → Apps → Shortcuts → Advanced → turn on Allow Sharing Large Amounts of Data.)',
    ],
  },
  {
    title: 'Part 3: make it your Paced icon',
    note: 'Opening Paced through this icon syncs your calendar every time, without any taps.',
    steps: [
      `Save the icon: open ${PACED_URL}icon-512.png in Safari → long-press the image → Save to Photos.`,
      'In the shortcut, tap its name at the top (or ⓘ) → Add to Home Screen. Name it Paced, tap the small icon → Choose Photo → pick the Paced icon → Add.',
      'If you added Paced to your Home Screen from Safari earlier, remove that icon (long-press → Remove App). From now on, open Paced only with the new icon.',
    ],
  },
  {
    title: 'Try it',
    steps: [
      'Tap the new Paced icon. Allow calendar access the first time. Shortcuts flashes for a moment, then Paced opens in Safari with your events already in.',
      'When your tasks or events change, Paced updates your "Paced" calendar by itself the next time you open it. iPhone asks "Open in Shortcuts?": tap Open and you come straight back.',
      'If Shortcuts asks before removing events or opening the URL, choose Always Allow so it stops asking.',
      'Tip: Settings app → Apps → Safari → Close Tabs → After One Day, so old Paced tabs don\'t pile up.',
    ],
  },
];
