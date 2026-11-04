# Paced: a to-do list that plans your deadlines

**Open it on your iPhone:** <https://karthiksundaram06.github.io/paced/> → Share → **Add to Home Screen**.

You add a task and say roughly how long it takes. Paced then tells you:

- **Time to complete**: your estimate minus what the timer has already tracked
- **When it'll be done**: work is slotted into your free time, around your calendar events
- **Deadlines**: whether you'll make the one you set (*On track / Tight / At risk*) and the latest time you can start. If you didn't set one, it suggests a realistic deadline.
- **Timer**: tap ▶ on any task. Tracked time lowers what's left and moves the plan.
- **Projects**: group tasks, give the project a deadline, and see its total time to complete and finish date.
- **Calendar**: work blocks and deadlines go into a **"Paced"** calendar on your iPhone, with alerts, and your events are read back so work is never planned during a lecture. This goes through one Apple Shortcut (setup below).

No App Store, no Expo Go, no laptop, no fees. Your tasks are stored only on your iPhone, inside the Home Screen app. Use **Settings → Back up tasks** now and then.

---

## Connect your calendar (one time, about 10 minutes)

Websites can't read the iPhone Calendar, but Apple's **Shortcuts** app can. You build one shortcut called **Paced Sync**. When you tap **Sync with Calendar** in Paced, the shortcut:

1. replaces the future events in your "Paced" calendar with the current plan (work blocks + deadlines), then
2. reads your events for the next 4 weeks and copies them, so you can tap **Paste calendar** back in Paced.

The same steps are inside the app (Settings → Shortcut setup guide).

### Before you start

1. Open the Calendar app → Calendars → Add Calendar → name it exactly "Paced" (put it in iCloud). Your work blocks and deadlines will live there.
2. Open the Shortcuts app → tap + → tap the name at the top → Rename → "Paced Sync" (exact spelling and capitals).
3. To add each action below, tap the search bar at the bottom, type the action name and tap it. To insert a variable (like Shortcut Input or Repeat Item), tap the field and pick it from the bar above the keyboard.

### Part 1: write the plan into your calendar
*These actions run only when Paced sends a plan.*

4. Add "If". Tap its first field → Shortcut Input. Set the condition to "has any value". If a line "Receive … input from Nowhere" appears at the top, tap Nowhere → turn on Share Sheet.
5. Inside the If (before "Otherwise"), add "Find Calendar Events". Add filter: Calendar is Paced. Add filter: End Date is in the next 60 days.
6. Add "Remove Events" (it uses the Calendar Events found above).
7. Add "Get Dictionary from Input" and set its input to Shortcut Input.
8. Add "Get Dictionary Value": Get Value for key events in Dictionary.
9. Add "Repeat with Each" and set it to the Dictionary Value from the step above.
10. Inside the Repeat: add "Get Dictionary Value": Value for key t in Repeat Item. Then add "Set Variable" and name it EvTitle.
11. Still inside: "Get Dictionary Value" for key s in Repeat Item, then "Set Variable" EvStart.
12. Still inside: "Get Dictionary Value" for key e in Repeat Item, then "Set Variable" EvEnd.
13. Still inside: add "Add New Event". Title: EvTitle. Start Date: EvStart. End Date: EvEnd. Calendar: Paced. Tap Show More → Alert: 5 minutes before (or whatever you like).
14. Leave the "Otherwise" part empty.

### Part 2: read your events back
*These go at the very bottom, after "End If".*

15. Add "Find Calendar Events". Filters: Start Date is in the next 28 days · Calendar is not Paced · Is All Day is false. Sort by Start Date, Oldest First. Leave Limit off.
16. Add "Repeat with Each" for those Calendar Events.
17. Inside, add "Text". Insert Repeat Item, tap it → Start Date → Date Format: ISO 8601, turn on Include ISO 8601 Time. Type |  then insert Repeat Item → End Date (same ISO 8601 format). Type |  then insert Repeat Item → Title.
18. After "End Repeat", add "Combine Text": combine Repeat Results with New Lines.
19. Add another "Text": type PACED-BUSY, press return, then insert Combined Text.
20. Add "Copy to Clipboard" (it copies that Text).
21. Add "Show Notification": "Calendar synced. Go back to Paced and tap Paste calendar."

### Try it

22. Tap ▶ in the shortcut editor once. Allow calendar access when asked. It copies your events.
23. Come back here and tap Paste calendar. Your events now show on Today, and work is planned around them.
24. From now on, just tap Sync with Calendar. iPhone asks to open Shortcuts: tap Open. The shortcut runs, then you come back and tap Paste calendar.
25. If Shortcuts asks before removing events, choose Always Allow so it stops asking.

### If something doesn't work

- **"Shortcut not found"**: the shortcut's name must be exactly `Paced Sync`.
- **Paste says it isn't from the shortcut**: the last Text action must start with the line `PACED-BUSY`, and Copy to Clipboard must come after it.
- **Paste says dates are unreadable**: in Part 2's Text action, Start Date and End Date need Date Format **ISO 8601** with **Include ISO 8601 Time** on.
- **Paste button does nothing**: iOS shows a small *Paste* bubble; tap it. If it never appears, long-press the box that shows up, choose Paste, then tap Load.
- **Events appear twice**: the "Remove Events" step must be inside the If, filtered to Calendar is *Paced*.

---

## How the planning works

1. **Free time** = your working hours (Settings, default 09:00–22:00, every day) minus your calendar events.
2. **Order**: earliest deadline first (a task inherits its project's deadline if that's sooner). Priority breaks ties. Tasks without a deadline go last.
3. **Blocks**: each task's remaining time is split into blocks (default 25–90 min) with a 10 min break after each.
4. **Status**: *On track* = finishes with room to spare · *Tight* = fits, but little spare free time before the deadline · *At risk* = finishes late or doesn't fit.
5. **Suggested deadline** (no deadline set): projected finish + a safety margin (default 20%, at least 1 h), rounded up to the hour.
6. **Start by**: the latest time you could start and still finish, if you worked only on this task.

## For developers

Expo SDK 58 / React Native 0.88, exported as a static web app (react-native-web) to GitHub Pages. The same code also builds as a native iOS app (`src/calendar.ts` uses EventKit directly there).

```
App.tsx                      tabs + editors
src/scheduler.ts             planning engine (pure, tested)
src/shortcutBridge.ts        web ⇄ Shortcuts calendar bridge
src/store.tsx                data, timer, storage, sync
src/screens/, src/components/
public/                      page template, manifest, icons, offline service worker
tests/scheduler.test.ts      npx tsx tests/scheduler.test.ts
```

Deploy: `npx expo export --platform web --output-dir dist`, add an empty `dist/.nojekyll` (GitHub Pages would otherwise hide the `_expo` folder), and push `dist/` to the `gh-pages` branch.
