import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { applyPracticeSocial, practiceSocial } from "../lib/practice-meta.js"

const require = createRequire(import.meta.url)
const qrcode = require("../js/qrcode.js") as (
  typeNumber: number,
  level: string
) => {
  addData: (data: string) => void
  make: () => void
  createSvgTag: (opts: { cellSize?: number; margin?: number; scalable?: boolean; alt?: string; title?: string }) => string
}

const origin = "https://hockey.derekbraid.com"

const tuesday = practiceSocial("?d=cone-weave,follow-the-pass&m=10,5&t=Tuesday", origin)
assert.ok(tuesday)
assert.equal(tuesday.drills, 2)
assert.equal(tuesday.minutes, 15)
assert.equal(tuesday.title, "Tuesday · Hockey Skills & Drills")
assert.equal(tuesday.description, "2 drills · 15 min")
assert.equal(tuesday.image, `${origin}/media/cone-weave/cone-weave.png`)

const skipped = practiceSocial("?d=not-a-drill,cone-weave&m=9,8", origin)
assert.ok(skipped)
assert.equal(skipped.drills, 1)
assert.equal(skipped.minutes, 8)
assert.equal(skipped.image, `${origin}/media/cone-weave/cone-weave.png`)

const encoded = new URLSearchParams()
encoded.set("d", "cone-weave,follow-the-pass")
encoded.set("m", "8,10")
encoded.set("t", "A & B <script>")
const fromBuilder = practiceSocial(encoded.toString(), origin, "/hockey-skills-and-drills")
assert.ok(fromBuilder)
assert.equal(fromBuilder.drills, 2)
assert.equal(fromBuilder.minutes, 18)
assert.equal(fromBuilder.image, `${origin}/hockey-skills-and-drills/media/cone-weave/cone-weave.png`)
assert.equal(fromBuilder.title, "A & B <script> · Hockey Skills & Drills")

assert.equal(practiceSocial("", origin), null)
assert.equal(practiceSocial("?d=not-a-drill", origin), null)

const oldLink = practiceSocial("d=cone-weave,follow-the-pass&m=10,", origin)
assert.ok(oldLink)
assert.equal(oldLink.drills, 2)
assert.equal(oldLink.minutes, 10)

const note = "Long strides, head up"
const packed = [encodeURIComponent(note), encodeURIComponent("D shoots")].join("%1F")
const parsedNotes = new URLSearchParams("d=cone-weave&n=" + packed)
assert.equal(parsedNotes.get("n"), `${note}\u001fD shoots`)

const html = `<title>Practice · Hockey Skills & Drills</title>
<!--practice-social-->
<meta name="description" content="fallback">
<!--/practice-social-->`
const rendered = applyPracticeSocial(html, fromBuilder, `${origin}/practice/?d=cone-weave`)
assert.match(rendered, /<title>A &amp; B &lt;script&gt; · Hockey Skills &amp; Drills<\/title>/)
assert.doesNotMatch(rendered, /<script>/)
assert.match(rendered, /property="og:description" content="2 drills · 18 min"/)
assert.match(rendered, /property="og:image" content="https:\/\/hockey\.derekbraid\.com\/hockey-skills-and-drills\/media\/cone-weave\/cone-weave\.png"/)

const qr = qrcode(0, "M")
qr.addData(`${origin}/practice/?d=cone-weave,follow-the-pass&m=8,10&t=Tuesday`)
qr.make()
const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: "QR code for this practice page", title: "Practice page" })
assert.match(svg, /<svg/)
assert.match(svg, /fill="black"/)
assert.match(svg, /fill="white"/)
assert.doesNotMatch(svg, /<script/)

console.log("practice meta ok")
