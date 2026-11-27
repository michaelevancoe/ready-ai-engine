# Ready AI Engine

Ready is an entry in the AI for Church 2026 hackathon, on the Care & Community track. It helps a church kids ministry get ready to welcome a child on Sunday.

## Three roles

- **Parent.** Answers questions about what helps their child, reviews the draft, and approves it. The parent can also read a short Sunday story and, later, a note from the leader.
- **Volunteer.** Reads the approved brief for this Sunday and can leave internal notes after class.
- **Leader.** Sets the church name, service, room, and plan. After Sunday, the leader drafts a note to the parent from the volunteer's notes and approves it before it is sent.

## What a family sees

The parent walks through one question at a time. After approval, the volunteer brief shows only what the parent approved. The Sunday story is a short calm story for the child. The after-Sunday note is signed by the children's ministry leader and the church.

## Fictional data

Every child, parent, volunteer, and church in this repository is fictional. The sample family and the sample churches are examples for the demo. Do not enter information about a real child.

## How the AI is used

Ready asks Workers AI, through an AI Gateway, to draft a profile, a Sunday story, a short thank-you while the parent is answering, and the after-Sunday note. Each draft is something a person approves. The model is told not to invent facts that were not in the answers or the notes.

If a draft cannot be written, the parent sees a plain error and can submit again. A thank-you that does not come back in time is replaced with a calm fallback line.

## Privacy defaults

The demo keeps visit data in memory for the session. It does not ask a family to create an account. The pages ask search engines not to index them. Logs record attempt metadata only, not the family's words and not gateway tokens.

## Run it

See `README.md` for how to install dependencies, run the tests, and start the local demo.

Michael Evancoe and Michael Edens.
