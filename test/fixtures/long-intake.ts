export const juniperName = 'Juniper';

export const juniperAge = 6;

const loves = [
  'Juniper is six and the middle kid, with an older brother who collects bottle caps and a little sister who follows her from room to room.',
  'Most mornings start with the stuffed fox. The fox is named Pip, and Pip has one floppy ear and a ribbon that used to be red.',
  'Juniper talks to Pip about the day before anyone else is awake. She lines Pip up with the other animals and tells them who is going out.',
  'If Pip is in the car, the drive is easier. She holds Pip in both hands and looks out the window at dogs, puddles, and the bakery.',
  'At home she builds little houses out of couch cushions and invites Pip inside. She likes stories about foxes, boats, and kids who pack a bag.',
  'She can talk for a long time about the boat story if nobody rushes her. Her brother reads it in a silly voice and she laughs.',
  'Her sister wants a turn with Pip, and Juniper will share if she gets Pip back before they leave the house.',
  'On Saturdays they walk to the park and Pip rides in the stroller basket. Juniper counts windows on the way and waves at the crossing guard.',
  'None of this is a plan for the morning. It is just how she warms up, with her brother, her sister, and Pip close by.',
  'If you ask her favorite thing, she will say the fox first and the boat story second. She likes to retell the ending, where the kids unpack the bag and find a quiet place to sit.',
  'She also loves helping her brother sort the bottle caps by color, as long as nobody times her. The little sister claps when the piles are done, and Juniper takes a bow.',
].join('\n\n');

const overwhelms = [
  'Big rushing mornings are hard for Juniper, especially when everyone talks at once and the coats are in a pile by the door.',
  'She hates hand dryers. The blast of air makes her cover her ears, and she would rather shake her hands dry or use a towel.',
  'When she feels wound up she hums when anxious, a small tune under her breath, and she likes people to wait until the hum slows down.',
  'Her brother sometimes slams a cupboard and she needs a minute. Her sister crying in the same room makes the morning feel crowded.',
  'Long lines, sudden clapping, and a surprise change of plan all pile up. She does better when someone tells her what is next in a calm voice.',
  'If the hum starts, it is a sign she is working hard, not a problem to stop. A quiet comment and a little time are enough.',
  'She will hold Pip and look at the floor until her shoulders drop. Then she can walk on with the rest of the family.',
].join('\n\n');

const whatHelps = [
  'A 5-minute warning before a change helps Juniper finish what she is doing. She can put Pip down and still know the fox is coming along.',
  'A weighted lap pad on her knees makes sitting feel steady. She likes the pad folded once, not piled up high.',
  'A picture schedule on the wall, with the next part shown as a simple drawing, lets her look instead of asking over and over.',
  'Her brother draws the pictures sometimes. Her sister points at them. Juniper likes to move a clip to the picture that is happening now.',
  'Short words, one step at a time, and a chance to answer in her own time all help. She does not need a long speech.',
  'If someone shows the picture schedule and names the 5-minute warning, she can move to the next thing with Pip under her arm.',
  'The weighted lap pad can stay on a chair so she sees it when she walks in. That is usually enough.',
].join('\n\n');

const communication = [
  'Juniper talks in full sentences when she is comfortable, and she talks to Pip first if the room is new.',
  'She points at the picture schedule when the words are slow. A nod means yes. Turning the fox to face you means she wants a turn.',
  'Her brother translates the fox games, but Juniper can say what she needs if you wait. Please let her finish the sentence.',
  'She hums a little when she is thinking. The hum is not the answer. The words that come after the hum are the answer.',
  'She likes choices you can see, two options, not five. She will say the one she wants, or hold up Pip toward that choice.',
  'If you ask a question, give her the whole pause. She often has the answer and is still lining up the words.',
  'Please repeat a direction once, in the same words, if she looks at Pip instead of answering. She heard you. She is getting the sentence ready, and a new wording makes her start over.',
].join('\n\n');

const sensory = [
  'Juniper notices air, light, and sound more than other kids in the family. Hand dryers are the hardest sound, and she will take a longer path to avoid them.',
  'Soft light is easier than a bright overhead glare. She likes a corner that is not in the middle of the bustle.',
  'The weighted lap pad is a steady feeling, not a toy. She may push it away if it is too heavy, and that is fine.',
  'Tags in shirts bother her, so her clothes are already picked for comfort. Pip is smooth and familiar.',
  'She can join a noisy moment if she knows it will be short and she can see the picture schedule afterward.',
  'Please do not be surprised if she covers her ears and hums. She comes back when the sound drops.',
  'A fan is usually fine. A hand dryer is not. If the bathroom is on the way, warn her before the door so she can cover her ears or take the other hall.',
].join('\n\n');

const allergies = [
  'Please keep gluten off her plate. Crackers, bread, and the usual snack cookies are the ones to swap.',
  'Her brother can eat those snacks. Her sister can too. Juniper needs a different basket, and she knows to ask before she takes food.',
  'This is the only food note. She is not fussy about fruit, cheese, or rice crackers, and she can sit with everyone else while they eat.',
  'If a craft uses paste that is not safe, offer her paper and markers instead. She will keep Pip in her lap and still join the table.',
  'Tell her what is safe in one plain sentence. She remembers, and she will check the picture if you draw the safe snack.',
  'No other food limits came up in this conversation. The gluten note is the whole of it, and the rest of the morning can stay ordinary.',
  'She can still sit at the same table. Just keep the gluten snacks in the other basket, and tell her which plate is hers before everyone starts eating.',
].join('\n\n');

export const juniperAnswers = {
  loves,
  overwhelms,
  whatHelps,
  communication,
  sensory,
  allergies,
} as const;

export type JuniperField = keyof typeof juniperAnswers;
