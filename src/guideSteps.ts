import { BACKUP_FILE } from './backup';
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
      'Open the Calendar app → Calendars → Add Calendar → name it exactly "Paced" (put it in iCloud). Your deadlines will live there.',
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
      'Add a second "Find Calendar Events" right under it (clear its input if it says "Filter …"). Set Start Date · is in the last · 30 · days, then Add Filter → Calendar is Paced. Then add another "Remove Events" under it. This clears blocks from past days, so a task you haven\'t finished doesn\'t stay behind on every day it was once planned, and finished or deleted tasks disappear too.',
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
      'Add "Find Calendar Events". Filters: Start Date is in the next 28 days · Is All Day is false. Sort by Start Date, Oldest First. Leave Limit off. (Paced ignores its own events when planning.)',
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
    title: 'Part 4: back up your tasks to iCloud Drive',
    note: 'So clearing Safari never loses your tasks, and your iPad gets them too. Do this once on your iPhone: the shortcut updates itself on your iPad.',
    steps: [
      `Add "Get File from Folder" and drag it to the very top, above "If". Set the folder to Shortcuts (iCloud Drive) and the path to ${BACKUP_FILE}. Tap the arrow (Show More) and turn off "Error If Not Found".`,
      'Add "Get Dictionary Value" and drag it inside the If, just above "Otherwise". Set it to Get Value for key data in Dictionary (tap the last field and pick the Dictionary from "Get Dictionary from Input").',
      `Right under it, add "Save File" (it saves the Dictionary Value). Tap the arrow, turn off "Ask Where to Save", type the path ${BACKUP_FILE}, and turn on "Overwrite If File Exists".`,
      'In Part 2\'s "Find Calendar Events", delete the filter "Calendar is not Paced" if it\'s there. Paced still ignores its own events, but this lets it rebuild your tasks from your deadlines if they are ever lost.',
      `Tap the Text that starts with ${BUSY_HEADER}. Put the cursor right before ${BUSY_HEADER}, insert the File variable (from Get File), then press return so ${BUSY_HEADER} starts its own line.`,
      'Check it: in Paced, pull Today down to sync (allow Shortcuts to use files: Always Allow), then do it once more. Settings → Data now says "Backed up to iCloud Drive".',
    ],
  },
  {
    title: 'Part 5 (optional): add tasks from the share sheet',
    note: 'Share a Brightspace page, an email or any web page to Paced: it opens a new task with the name filled in and the deadline ready to pick. Do this once on your iPhone; your iPad and Mac get it too.',
    steps: [
      'In Shortcuts, tap + to make a new shortcut and name it "Add to Paced".',
      'Tap ⓘ at the bottom and turn on "Show in Share Sheet". Tap Done.',
      'Add "Get Name". It should say Get name of Shortcut Input.',
      'Add "URL Encode". It encodes the Name.',
      `Add "URL" and type ${PACED_URL}#add= then, right after the =, insert the URL Encoded Text variable.`,
      'Add "Open URLs". Done.',
      'Try it: in Safari open any page, tap Share, then Add to Paced (scroll the row of apps or tap More if you don\'t see it).',
    ],
  },
  {
    title: 'Try it',
    steps: [
      'Tap the new Paced icon. Allow calendar access the first time. Shortcuts flashes for a moment, then Paced opens in Safari with your events already in.',
      'Every time you open Paced with that icon, your events refresh in the background, with no taps. To put your deadlines into the "Paced" calendar, tap Sync now (iPhone asks "Open in Shortcuts?": tap Open and you come straight back). Want that automatic? Settings → Update Calendar automatically.',
      'If Shortcuts asks before removing events, turn on Settings app → Apps → Shortcuts → Advanced → Allow Deleting Without Confirmation.',
      'Tip: Settings app → Apps → Safari → Close Tabs → After One Day, so old Paced tabs don\'t pile up.',
    ],
  },
];
