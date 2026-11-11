# Manual test (real mic, Chrome)

Run `npm run dev`, open http://localhost:5173 in Chrome, press **Start listening**. Read the lines aloud in your own voice; they are scripted. Items 1–3 and 5–9 work with the mock guesser; item 10 needs `ANTHROPIC_API_KEY`.

| #   | Do this                                                                                                                                                      | Expected                                                                        | Result        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------- |
| 1   | Say "I need to go to the… the place where you get medicine…" and stop                                                                                        | Within ~2 s a pop-up shows pharmacy                                             | ☐ Pass ☐ Fail |
| 2   | Then say "pharmacy"                                                                                                                                          | The pop-up shows "Got it: pharmacy", then clears                                | ☐ Pass ☐ Fail |
| 3   | Say a fluent sentence ("We reviewed the budget and agreed to meet on Thursday")                                                                              | No pop-up                                                                       | ☐ Pass ☐ Fail |
| 4   | Say "Can you pass the… the thing for cutting bread… knife" without pausing long                                                                              | No pop-up, or it disappears at once                                             | ☐ Pass ☐ Fail |
| 5   | Press **Pause listening**, speak, then **Start listening**                                                                                                   | No transcript while paused; transcript resumes after Start                      | ☐ Pass ☐ Fail |
| 6   | Switch to another tab for 30 s, come back, speak                                                                                                             | Transcript still works without pressing Start                                   | ☐ Pass ☐ Fail |
| 7   | Stop the server (Ctrl+C), then start it again                                                                                                                | Status shows "reconnecting" and "Listening paused…", then "connected" by itself | ☐ Pass ☐ Fail |
| 8   | Block the mic (lock icon > Site settings), reload, press Start                                                                                               | A calm message says the mic is blocked; the page does not crash                 | ☐ Pass ☐ Fail |
| 9   | Stay silent for 60 s while listening                                                                                                                         | Still listening afterwards; no pop-up                                           | ☐ Pass ☐ Fail |
| 10  | Paste the Northwind brief (see below) into the brief box, press **Use this brief**, say "We'd need to sort out the… the thing, the yearly… what's it called" | Pop-up lists renewal (and maybe licence, contract)                              | ☐ Pass ☐ Fail |

Brief: "Q3 review with Northwind (fictional), renewal of the analytics licence."
