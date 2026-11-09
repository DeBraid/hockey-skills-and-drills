// Public game lines copied from the West Niagara Minor Hockey iCal feeds.
// No roster or player names. "Example" is used only for the cancel filter.

function vevent(start: string, location: string, summary: string, status = ""): string {
  return `BEGIN:VEVENT
DTSTART:${start}
LOCATION:${location}
${status ? `STATUS:${status}\n` : ""}SUMMARY:${summary}
END:VEVENT`
}

function calendar(events: string): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
${events}
END:VCALENDAR
`
}

// U11 Select, team 2897, captured 2026-11-09 from webcal.ashx?IDs=2897.
export const SELECT_ICS = calendar(
  [
    vevent("20261024T190000Z", "Moses Springer Arena", "Select - U11 - Game @ Waterloo (W 5-1)"),
    vevent("20261101T184500Z", "Grimsby Peach King Center East Pad", "Select - U11 - Practice"),
    vevent("20261108T184500Z", "Grimsby Peach King Center East Pad", "Select - U11 - Game vs WATERLOO WOLVES(W 0-4)"),
    vevent("20261115T001500Z", "Fleming Memorial Arena", "Select - U11 - Game vs Mount Hamilton "),
    vevent("20261115T223000Z", "Grimsby Peach King Center East Pad", "Select - U11 - Game vs Jordan  Lions"),
    vevent("20261129T200000Z", "Dave Anderchuck Arena", "Select - U11 - Game @ Mount Hamilton "),
    vevent("20261203T000000Z", "Merritton Centennial Arena", "Select - U11 - Game @ CYO "),
    vevent("20261220T211500Z", "Grimsby Peach King Center East Pad", "Select - U11 - Game vs CYO "),
    vevent("20270103T003000Z", "Jordan Arena", "Select - U11 - Game vs Jordan  Lions"),
    vevent("20270117T211500Z", "Grimsby Peach King Center East Pad", "Select - U11 - Game vs Burlington Bulldogs"),
  ].join("\n")
)

// One real Select summary, marked cancelled, must not become a lineup name.
export const SELECT_CANCELLED_ICS = calendar(
  vevent("20261115T001500Z", "Fleming Memorial Arena", "Select - U11 - Game vs Mount Hamilton ", "CANCELLED")
)

// The word "cancel" in the summary is also skipped. Opponent here is not a real game.
export const CANCEL_WORD_ICS = calendar(
  vevent("20261115T001500Z", "Fleming Memorial Arena", "Select - U11 - Game vs Example CANCELLED")
)

// U11 Stars, team 2945. The Mustangs summary is folded the way the live feed folds it.
export const STARS_ICS = calendar(
  `BEGIN:VEVENT
DTSTART:20261023T221500Z
LOCATION:Fleming Memorial Arena
SUMMARY:Local - U11 - Stars - Game vs Local - U11 - Mustangs [U11-R9](W 3-6
 )
END:VEVENT
${vevent("20261109T230000Z", "Grimsby Peach King Center East Pad", "Local - U11 - Stars - Game @ Local - U11 - Hurricanes [U11-R28]")}
${vevent("20261113T230000Z", "Fleming Memorial Arena", "Local - U11 - Stars - Game vs Local - U11 - Falcons [U11-R25]")}
${vevent("20261203T230000Z", "Fleming Memorial Arena", "Local - U11 - Stars - Game vs Local - U11 - Lightning [U11-R42]")}
${vevent("20261221T230000Z", "West Lincoln Arena", "Local - U11 - Stars - Game vs Local - U11 - Spitfires [U11-P10]")}`
)

// Same public Oct 24 game, used to assert a feed with nothing upcoming.
export const SELECT_PAST_ICS = calendar(
  vevent("20261024T190000Z", "Moses Springer Arena", "Select - U11 - Game @ Waterloo (W 5-1)")
)

export const SELECT_FEED = "https://westniagaraminorhockey.ca/webcal.ashx?IDs=2897"
export const STARS_FEED = "https://westniagaraminorhockey.ca/webcal.ashx?IDs=2945"

export const AS_OF_NOV_9 = Date.parse("2026-11-09T18:00:00.000Z")
