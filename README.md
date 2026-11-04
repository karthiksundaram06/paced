# Paced: a to-do list that plans your deadlines

**On your iPhone:** build the *Paced Sync* shortcut below and add it to your Home Screen as **Paced**. That icon is how you open the app, and it syncs your calendar every time. (Without the calendar you can also just open <https://karthiksundaram06.github.io/paced/> in Safari.)

You add a task and say roughly how long it takes. Paced then tells you:

- **Time to complete**: your estimate minus what the timer has already tracked
- **When it'll be done**: work is slotted into your free time, around your calendar events
- **Deadlines**: a live countdown for every task and project deadline, whether you'll make it (*On track / Tight / At risk*), and the latest time you can start. If you didn't set a deadline, it suggests a realistic one.
- **Timer**: tap ▶ on any task. Tracked time lowers what's left and moves the plan.
- **Projects**: group tasks, give the project a deadline, and see its total time to complete and finish date.
- **Calendar, automatically**: your events are read every time you open Paced, and work blocks and deadlines go into a **"Paced"** calendar with alerts whenever your plan changes.

No App Store, no Expo Go, no laptop, no fees. Your tasks are stored only on your iPhone (in Safari's storage for this site). Use **Settings → Back up tasks** now and then.

---

## Connect your calendar (one time, about 10 minutes)

Websites can't read the iPhone Calendar, but Apple's **Shortcuts** app can. You build one shortcut called **Paced Sync** and put it on your Home Screen as the Paced icon:

- **Tap the icon:** it reads your next 4 weeks of events and opens Paced with them already loaded.
- **When your tasks or events have changed**, Paced passes the new plan to the shortcut (iPhone asks "Open in Shortcuts?" → Open). The shortcut puts work blocks and deadlines into the "Paced" calendar and brings you straight back.

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

### Part 2: read your events and open Paced
*These go at the very bottom, after "End If". (Built an older version with Copy to Clipboard? Delete Copy to Clipboard and Show Notification, then do the last two steps here.)*

15. Add "Find Calendar Events". Filters: Start Date is in the next 28 days · Calendar is not Paced · Is All Day is false. Sort by Start Date, Oldest First. Leave Limit off.
16. Add "Repeat with Each" for those Calendar Events.
17. Inside, add "Text". Insert Repeat Item, tap it → Start Date → Date Format: ISO 8601, turn on Include ISO 8601 Time. Type |  then insert Repeat Item → End Date (same ISO 8601 format). Type |  then insert Repeat Item → Title.
18. After "End Repeat", add "Combine Text": combine Repeat Results with New Lines.
19. Add another "Text": type PACED-BUSY, press return, then insert Combined Text.
20. Add "URL Encode" (it encodes that Text).
21. Add "Open URLs". In its URL field type https://karthiksundaram06.github.io/paced/?sync=done&result=  and straight after "result=" insert URL Encoded Text. Nothing after it.

### Part 3: make it your Paced icon
*Opening Paced through this icon syncs your calendar every time, without any taps.*

22. Save the icon: open https://karthiksundaram06.github.io/paced/icon-512.png in Safari → long-press the image → Save to Photos.
23. In the shortcut, tap its name at the top (or ⓘ) → Add to Home Screen. Name it Paced, tap the small icon → Choose Photo → pick the Paced icon → Add.
24. If you added Paced to your Home Screen from Safari earlier, remove that icon (long-press → Remove App). From now on, open Paced only with the new icon.

### Try it

25. Tap the new Paced icon. Allow calendar access the first time. Shortcuts flashes for a moment, then Paced opens in Safari with your events already in.
26. When your tasks or events change, Paced updates your "Paced" calendar by itself the next time you open it. iPhone asks "Open in Shortcuts?": tap Open and you come straight back.
27. If Shortcuts asks before removing events or opening the URL, choose Always Allow so it stops asking.
28. Tip: Settings app → Apps → Safari → Close Tabs → After One Day, so old Paced tabs don't pile up.

### If something doesn't work

- **"Shortcut not found"**: the shortcut's name must be exactly `Paced Sync`.
- **Paced opens but says the events aren't from the shortcut**: the second Text action must start with the line `PACED-BUSY`, and Open URLs must end with `result=` followed by *URL Encoded Text*.
- **"Dates are unreadable"**: in Part 2's Text action, Start Date and End Date need Date Format **ISO 8601** with **Include ISO 8601 Time** on.
- **Shortcut runs but you stay in Shortcuts**: the last action must be **Open URLs** with the Paced address.
- **Paced keeps sending you to Shortcuts**: it does that at most once every 10 minutes, and only when your plan changed. You can switch it off under Settings → Sync automatically.
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

Deploy: `npx expo export --platform web --output-dir dist` → push `dist/` to the `gh-pages` branch (the included GitHub Action does this on every push to `main`).
